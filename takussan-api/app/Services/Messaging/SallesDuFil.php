<?php

namespace App\Services\Messaging;

use App\Models\Booking;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-2960 (ADR-0128 § 2) — les SALLES : un fil par bail et par réservation, dont les membres sont
 * exactement les parties de l'objet, synchronisés sur le patron de `SyncMaintenanceConversation`.
 *
 *  - **salle du bail** (`type = lease`, sujet `lease:<id>`, contexte `lease_id` et `property_id`) :
 *    le compte du locataire (`leases.tenant_id` → `customers.user_id`), le bailleur désigné
 *    (`landlord_id`), l'agent attribué (`agent_id`) ;
 *  - **salle de la réservation** (`type = booking`, sujet `booking:<id>`, contexte `property_id`) : le
 *    compte du candidat (`bookings.customer_id` → `customers.user_id`) et le contact principal ACTUEL
 *    du bien ({@see PrimaryPropertyContact::for()}). Il n'a pas de point unique de changement
 *    (ADR-0068) : la salle le transmet à chaque ouverture, et `ConversationAccess` refuse l'ancien
 *    entre-temps.
 *
 * **Création unique** : `insertOrIgnore` sur l'index partiel `conversations_salle_unique`, puis
 * relecture. Aucune violation d'unicité n'est attrapée (piège PostgreSQL n° 1).
 *
 * **Synchronisation** : la ligne de la salle verrouillée (`lockForUpdate`, comme
 * `GroupConversationService::addParticipants`), puis seules les participations qui changent sont
 * écrites, PAR LE MODÈLE (`attach` passe par le pivot `ConversationParticipant`, `forceFill()->save()`) :
 * c'est son trait `EmetDesSignaux` (TCK-2955) qui émet `participants.updated` sur le fil et
 * `boite.updated` à la seule personne ajoutée, revenue ou retirée, après le COMMIT. Le verrou sérialise
 * deux synchronisations d'une même salle : la seconde lit ce que la première a écrit, et l'unicité
 * `(conversation_id, user_id)` n'est jamais heurtée. Une synchronisation qui ne change rien n'écrit
 * rien, donc n'émet rien. Aucune invitation, aucune notification, aucun avis système.
 *
 * `conversations.subject` (le titre) reste nul : le front nomme la salle depuis son objet.
 */
final class SallesDuFil
{
    /** Le type de fil de la salle de chaque type d'objet (clé de `SujetsDuFil`). */
    private const TYPES = [
        'lease' => ConversationType::Lease,
        'booking' => ConversationType::Booking,
    ];

    /**
     * Bail FINI : la salle se lit, ne s'écrit plus. Liste explicite, et non « hors de
     * `Lease::ONGOING_STATUSES` », qui fermerait aussi `draft` et `pending_signature`.
     */
    public const BAUX_EN_LECTURE_SEULE = [
        LeaseStatus::Expired->value,
        LeaseStatus::Terminated->value,
        LeaseStatus::Renewed->value,
    ];

    /**
     * Réservation close SANS AVOIR EU LIEU (les causes de `BookingClosed`). `completed` reste ouverte :
     * la caution et les suites du séjour s'y disent.
     */
    public const RESERVATIONS_EN_LECTURE_SEULE = [
        BookingStatus::Rejected->value,
        BookingStatus::Cancelled->value,
        BookingStatus::Expired->value,
    ];

    /** @return list<string> les types d'objets qui ont une salle */
    public static function typesAvecSalle(): array
    {
        return array_keys(self::TYPES);
    }

    /** @return list<string> les valeurs de `conversations.type` d'une salle */
    public static function typesDeFil(): array
    {
        return array_values(array_map(fn (ConversationType $t) => $t->value, self::TYPES));
    }

    public static function estUneSalle(Conversation $conversation): bool
    {
        return in_array($conversation->type, self::TYPES, true);
    }

    /**
     * L'objet d'une salle, VIVANT : `null` pour un fil qui n'est pas une salle, une salle dont le sujet
     * ne correspond pas à son type, ou un objet absent ou supprimé (la salle devient alors illisible,
     * comme le fil d'une intervention supprimée).
     */
    public static function objetDeLaSalle(Conversation $conversation): Lease|Booking|null
    {
        if (! self::estUneSalle($conversation) || $conversation->subject_id === null) {
            return null;
        }

        $type = array_search($conversation->type, self::TYPES, true);
        if ($conversation->subject_type !== $type) {
            return null;
        }

        $objet = SujetsDuFil::resoudre($type, (int) $conversation->subject_id);

        return ($objet instanceof Lease || $objet instanceof Booking) && ! $objet->trashed() ? $objet : null;
    }

    /** La salle est-elle en lecture seule par l'état de son objet (bail fini, réservation close) ? */
    public static function enLectureSeule(Conversation $conversation): bool
    {
        $objet = self::objetDeLaSalle($conversation);
        $statut = $objet?->status instanceof \BackedEnum ? $objet->status->value : $objet?->status;

        return match (true) {
            $objet instanceof Lease => in_array($statut, self::BAUX_EN_LECTURE_SEULE, true),
            $objet instanceof Booking => in_array($statut, self::RESERVATIONS_EN_LECTURE_SEULE, true),
            default => false,
        };
    }

    /**
     * Salle de réservation : le candidat, ou le contact principal ACTUEL du bien. Un ancien contact
     * resté participant n'y a plus accès dès que le contact change, avant toute écriture.
     */
    public static function candidatOuContactActuel(User $user, Booking $booking): bool
    {
        if ($booking->customer !== null && (int) $booking->customer->user_id === (int) $user->id) {
            return true;
        }

        $property = self::bienAvecContact($booking);

        return $property !== null && PrimaryPropertyContact::for($property)?->id === $user->id;
    }

    /** La salle existante de l'objet (non supprimée), sans la créer. */
    public function salleDe(Lease|Booking $objet): ?Conversation
    {
        $type = SujetsDuFil::typeDuSujet($objet);

        return Conversation::query()
            ->where('type', self::TYPES[$type]->value)
            ->where('subject_type', $type)
            ->where('subject_id', $objet->getKey())
            ->first();
    }

    /**
     * Ouvre la salle de l'objet : la crée si elle manque (une fois, quel que soit le nombre d'appels
     * simultanés), puis synchronise ses membres. `null` pour un objet supprimé, ou sans aucun compte
     * possible (journalisé). `wasRecentlyCreated` dit si CET appel l'a créée.
     */
    public function ouvrir(Lease|Booking $objet): ?Conversation
    {
        if ($objet->trashed()) {
            return null;
        }

        $creee = false;
        $salle = $this->salleDe($objet);

        if ($salle === null) {
            $membres = $this->membresAttendus($objet);
            $createur = $this->createur($objet, $membres);
            if ($createur === null) {
                Log::info('[salles] aucune personne pour ouvrir la salle', [
                    'type' => SujetsDuFil::typeDuSujet($objet),
                    'id' => (int) $objet->getKey(),
                ]);

                return null;
            }

            $type = SujetsDuFil::typeDuSujet($objet);
            $maintenant = now();
            // Piège PostgreSQL n° 1 : `ON CONFLICT DO NOTHING` sur l'index partiel, jamais un `try/catch`.
            $creee = DB::table('conversations')->insertOrIgnore([
                'subject' => null,
                'type' => self::TYPES[$type]->value,
                'status' => ConversationStatus::Active->value,
                'created_by' => $createur,
                'property_id' => $objet->property_id,
                'lease_id' => $objet instanceof Lease ? $objet->getKey() : null,
                'subject_type' => $type,
                'subject_id' => $objet->getKey(),
                'created_at' => $maintenant,
                'updated_at' => $maintenant,
            ]) === 1;

            $salle = $this->salleDe($objet);
            if ($salle === null) {
                return null;
            }
        }

        $this->synchroniser($salle, $objet);
        $salle->wasRecentlyCreated = $creee;

        return $salle;
    }

    /**
     * {@see self::ouvrir()} pour un déclencheur (observateur, écouteur) qui tourne APRÈS le COMMIT de
     * l'écriture qui le cause : un échec est rapporté, il ne transforme pas en 500 une écriture déjà
     * validée. Ce n'est pas une garde d'unicité — la création n'en lève aucune.
     */
    public function ouvrirApresLEcriture(Lease|Booking $objet): void
    {
        try {
            $this->ouvrir($objet);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * Les comptes qui doivent être membres actifs de la salle de `$objet`, triés, sans doublon, et
     * existants (un compte supprimé en douceur n'en est pas).
     *
     * @return list<int>
     */
    public function membresAttendus(Lease|Booking $objet): array
    {
        if ($objet instanceof Lease) {
            $ids = [
                $objet->tenant()->value('user_id'),
                $objet->landlord_id,
                $objet->agent_id,
            ];
        } else {
            $ids = [
                $objet->customer()->value('user_id'),
                self::bienAvecContact($objet) !== null ? PrimaryPropertyContact::for(self::bienAvecContact($objet))?->id : null,
            ];
        }

        $ids = array_values(array_unique(array_map('intval', array_filter($ids, fn ($id) => $id !== null))));
        if ($ids === []) {
            return [];
        }

        return User::query()->whereKey($ids)->orderBy('id')->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * Aligne les participations de la salle sur les parties de son objet. Rien pour une salle dont
     * l'objet est supprimé : elle est fermée par `FermeLeFilDeSonObjet`, et ses membres restent ceux
     * qu'elle avait (la restauration la rouvre telle quelle).
     */
    public function synchroniser(Conversation $salle, Lease|Booking|null $objet = null): void
    {
        $objet ??= self::objetDeLaSalle($salle);
        if ($objet === null || $objet->trashed()) {
            return;
        }

        $attendus = $this->membresAttendus($objet);

        DB::transaction(function () use ($salle, $attendus): void {
            Conversation::query()->whereKey($salle->getKey())->lockForUpdate()->firstOrFail();

            /** @var Collection<int, ConversationParticipant> $lignes */
            $lignes = ConversationParticipant::query()
                ->where('conversation_id', $salle->getKey())
                ->get()
                ->keyBy(fn (ConversationParticipant $p) => (int) $p->user_id);

            foreach ($attendus as $uid) {
                $ligne = $lignes->get($uid);
                if ($ligne === null) {
                    $salle->participants()->attach($uid, [
                        'role' => ParticipantRole::Member->value,
                        'joined_at' => now(),
                    ]);
                } elseif ($ligne->left_at !== null) {
                    $ligne->forceFill([
                        'role' => ParticipantRole::Member->value,
                        'joined_at' => now(),
                        'left_at' => null,
                        'archived_at' => null,
                        // Ce qui s'est écrit pendant l'absence n'est pas « non lu » (règle de TCK-861).
                        'last_read_at' => now(),
                    ])->save();
                }
            }

            foreach ($lignes as $uid => $ligne) {
                if ($ligne->left_at === null && ! in_array($uid, $attendus, true)) {
                    $ligne->forceFill(['left_at' => now()])->save();
                }
            }
        });
    }

    /**
     * Le `created_by` de la salle (non nul, clé vers `users`) : pour un bail, l'agent, à défaut le
     * bailleur, à défaut le propriétaire du bien ; pour une réservation, son auteur, à défaut le
     * contact principal, à défaut le compte du candidat.
     *
     * @param  list<int>  $membres
     */
    private function createur(Lease|Booking $objet, array $membres): ?int
    {
        if ($objet instanceof Lease) {
            $candidats = [$objet->agent_id, $objet->landlord_id, Property::withTrashed()->whereKey($objet->property_id)->value('user_id')];
        } else {
            $bien = self::bienAvecContact($objet);
            $candidats = [
                $objet->created_by_id,
                $bien !== null ? PrimaryPropertyContact::for($bien)?->id : null,
                $objet->customer()->value('user_id'),
            ];
        }

        foreach ($candidats as $id) {
            if ($id !== null && (in_array((int) $id, $membres, true) || User::query()->whereKey($id)->exists())) {
                return (int) $id;
            }
        }

        return null;
    }

    /** Le bien de la réservation, chargé avec ce que `PrimaryPropertyContact` lit. */
    private static function bienAvecContact(Booking $booking): ?Property
    {
        $property = $booking->property;
        if (! $property instanceof Model) {
            return null;
        }
        $property->loadMissing(PrimaryPropertyContact::eagerLoads());

        return $property;
    }
}
