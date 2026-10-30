<?php

namespace App\Services\Radar\Observatory;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Property\PropertyPublication;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2432 — la source d'un bien publié par le Radar a disparu ({@see RadarSourceWatch}) : son titulaire est prié de dire
 * si le bien est toujours disponible ; sans réponse, l'équipe reçoit une PROPOSITION de retrait. Jamais de retrait automatique.
 *
 * **La question** ({@see self::ask()}) part au titulaire du bien (`properties.user_id`), un COMPTE Takussan : jamais à
 * l'annonceur source ni à un numéro — le code n'est ni `mobile()` ni `reachesContacts()`, et il suit les préférences du
 * compte (`property_availability_check`) comme toute notification produit. Elle ne part que :
 *   · pour un bien que le Radar a publié (une annonce collectée porte son `property_id`) — le titulaire d'un bien du
 *     catalogue dont une annonce n'est que le doublon apprendrait que la plateforme surveille ses annonces ailleurs ;
 *   · pour un bien encore en vitrine (`Property::public()`) — sorti, il n'y a rien à retirer ;
 *   · quand la DERNIÈRE source en ligne du bien disparaît — tant qu'une autre annonce du bien est en ligne, le bien l'est
 *     sans doute aussi. C'est {@see RadarSourceWatch} qui en juge (`other_sources_online`) avant d'appeler.
 * Une fois par disparition : le marqueur `availability_asked_at` se pose par un `UPDATE … WHERE … IS NULL`, et la ligne du
 * bien se verrouille pour qu'une seule question soit ouverte par bien. Le retour de l'annonce efface le marqueur
 * ({@see RadarSourceWatch}) : une nouvelle disparition repose la question.
 *
 * **La réponse** ({@see self::answer()}) : `rented` et `sold` passent le bien à son statut existant, hors vitrine (par
 * {@see PropertyPublication::statusAttributes()}, l'écriture de `PUT …/status`) ; `available` ne fait que noter la réponse.
 *
 * **La proposition** ({@see self::proposeWithdrawals()}) : une question restée sans réponse `radar.observe.owner_answer_days`
 * jours écrit {@see self::PROPOSAL_EVENT}, événement alertable : les règles de la console la livrent, l'équipe décide.
 * Journal de plateforme, sujet l'annonce collectée et le bien dans `properties.property_id`, comme
 * {@see RadarSourceWatch::EVENT}.
 */
final class RadarAvailabilityCheck
{
    public const PROPOSAL_EVENT = 'radar_withdrawal_proposed';

    public const ANSWER_EVENT = 'radar_availability_answered';

    public const ANSWERS = ['rented', 'sold', 'available'];

    public function __construct(
        private readonly NotificationService $notifications,
        private readonly PropertyPublication $publication,
    ) {}

    /**
     * Pose la question au titulaire du bien pour la disparition en cours de `$listing`, s'il y a lieu. À appeler dans la
     * transaction qui a constaté la disparition, quand aucune autre source du bien n'est plus en ligne.
     *
     * @return bool vrai si une notification est partie
     */
    public function ask(RadarListing $listing, Property $property): bool
    {
        return DB::transaction(function () use ($listing, $property): bool {
            $locked = Property::query()->whereKey($property->id)->lockForUpdate()->first();
            if ($locked === null || ! $this->radarPublished($locked->id) || ! Property::query()->public()->whereKey($locked->id)->exists()) {
                return false;
            }

            $claimed = RadarListing::query()->whereKey($listing->id)
                ->whereNotNull('source_gone_at')
                ->whereNull('availability_asked_at')
                ->update(['availability_asked_at' => now()]);
            if ($claimed !== 1) {
                return false;
            }

            // Une question déjà ouverte pour ce bien (une autre de ses sources) couvre celle-ci : la réponse vaudra pour les deux.
            $alreadyOpen = $this->openChecks($locked->id)->whereKeyNot($listing->id)->exists();
            $owner = $locked->user_id === null ? null : User::query()->find($locked->user_id);
            if ($alreadyOpen || $owner === null) {
                return false;
            }

            $this->notifications->send(
                $owner,
                NotificationCode::PropertySourceListingGone,
                ['property' => (string) $locked->title],
                NotificationTarget::of('property', $locked->id)->forAgency($locked->agency_id),
                mobileBorne: false,
                agencyId: $locked->agency_id === null ? null : (int) $locked->agency_id,
            );

            return true;
        });
    }

    /**
     * La réponse du titulaire (ou de qui peut modifier le bien — l'appelant l'a autorisé).
     *
     * @return array{answer: string, status: string, recorded: int}
     */
    public function answer(Property $property, string $answer, User $by): array
    {
        // La requête a validé la réponse : une autre valeur est une faute de programmation.
        if (! in_array($answer, self::ANSWERS, true)) {
            throw new \InvalidArgumentException("Réponse inconnue : {$answer}");
        }

        return DB::transaction(function () use ($property, $answer, $by): array {
            $locked = Property::query()->whereKey($property->id)->lockForUpdate()->firstOrFail();

            $status = match ($answer) {
                'rented' => PropertyStatus::Rented,
                'sold' => PropertyStatus::Sold,
                default => null,
            };
            // Seul un bien en vitrine change de statut : un bien déjà sorti (brouillon, archivé) garde le sien.
            if ($status !== null && $this->publication->canUnpublish($locked)) {
                $locked->update($this->publication->statusAttributes($locked, $status));
            }

            $open = $this->openChecks($locked->id)->orderBy('id')->get(['id']);
            $recorded = RadarListing::query()->whereIn('id', $open->pluck('id'))->update([
                'availability_answer' => $answer,
                'availability_answered_at' => now(),
                'availability_answered_by_id' => $by->id,
            ]);

            foreach ($open as $listing) {
                activity('Radar')
                    ->causedBy($by)
                    ->performedOn($listing)
                    ->event(self::ANSWER_EVENT)
                    ->withProperties(['property_id' => $locked->id, 'radar_listing_id' => $listing->id, 'answer' => $answer])
                    ->log('Disponibilité du bien confirmée par son titulaire');
            }

            return ['answer' => $answer, 'status' => $locked->refresh()->status->value, 'recorded' => $recorded];
        });
    }

    /** La question ouverte la plus ancienne du bien, `null` sans question ouverte. */
    public function openSince(Property $property): ?\DateTimeInterface
    {
        $askedAt = $this->openChecks($property->id)->min('availability_asked_at');

        return $askedAt === null ? null : now()->parse($askedAt);
    }

    /**
     * Les questions restées sans réponse au délai : une proposition de retrait par bien, une seule fois.
     *
     * @return int le nombre de propositions écrites
     */
    public function proposeWithdrawals(): int
    {
        $deadline = now()->subDays(self::answerDays());
        $candidates = RadarListing::query()
            ->whereNotNull('source_gone_at')
            ->whereNotNull('availability_asked_at')
            ->whereNull('availability_answer')
            ->whereNull('withdrawal_proposed_at')
            ->where('availability_asked_at', '<=', $deadline)
            ->orderBy('id')
            ->get(['id', 'property_id', 'duplicate_of_listing_id', 'duplicate_of_property_id', 'availability_asked_at']);

        $proposals = 0;
        foreach ($candidates as $candidate) {
            $propertyId = $this->propertyOf($candidate);
            if ($propertyId === null) {
                continue;
            }
            $proposals += DB::transaction(function () use ($candidate, $propertyId): int {
                $locked = Property::query()->whereKey($propertyId)->lockForUpdate()->first();
                if ($locked === null) {
                    return 0;
                }
                // Une proposition par bien : elle règle toutes ses questions ouvertes. Réclamée sous condition, une fois.
                $claimed = $this->openChecks($locked->id)
                    ->whereNull('withdrawal_proposed_at')
                    ->update(['withdrawal_proposed_at' => now()]);
                // Hors vitrine depuis (retiré par l'équipe, loué par une autre voie) : marquée, rien à proposer.
                if ($claimed === 0 || ! Property::query()->public()->whereKey($locked->id)->exists()) {
                    return 0;
                }

                activity('Radar')
                    ->performedOn(RadarListing::query()->findOrFail($candidate->id))
                    ->event(self::PROPOSAL_EVENT)
                    ->withProperties([
                        'property_id' => $locked->id,
                        'radar_listing_id' => $candidate->id,
                        'asked_at' => (string) $candidate->getRawOriginal('availability_asked_at'),
                        'answer_days' => self::answerDays(),
                    ])
                    ->log('Retrait proposé : le titulaire n\'a pas répondu');

                return 1;
            });
        }

        return $proposals;
    }

    /** Le délai de réponse du titulaire, en jours (`radar.observe.owner_answer_days`, 1 au moins). */
    public static function answerDays(): int
    {
        return max(1, (int) config('radar.observe.owner_answer_days', 7));
    }

    /** Les colonnes que le retour d'une annonce efface : une nouvelle disparition repose la question. */
    public static function resetColumns(): array
    {
        return [
            'availability_asked_at' => null,
            'availability_answer' => null,
            'availability_answered_at' => null,
            'availability_answered_by_id' => null,
            'withdrawal_proposed_at' => null,
        ];
    }

    /** Les annonces du bien dont la question est posée, sans réponse, la source toujours disparue. */
    private function openChecks(int $propertyId): Builder
    {
        return $this->sourcesOf($propertyId)
            ->whereNotNull('source_gone_at')
            ->whereNotNull('availability_asked_at')
            ->whereNull('availability_answer');
    }

    /** Les annonces collectées qui représentent le bien : la sienne, ses doublons, et les doublons du bien du catalogue. */
    private function sourcesOf(int $propertyId): Builder
    {
        return RadarListing::query()->where(fn (Builder $q) => $q
            ->where('property_id', $propertyId)
            ->orWhere('duplicate_of_property_id', $propertyId)
            ->orWhereIn('duplicate_of_listing_id', RadarListing::query()->select('id')->where('property_id', $propertyId)));
    }

    private function radarPublished(int $propertyId): bool
    {
        return RadarListing::query()->where('property_id', $propertyId)->exists();
    }

    private function propertyOf(RadarListing $listing): ?int
    {
        if ($listing->property_id !== null) {
            return (int) $listing->property_id;
        }
        if ($listing->duplicate_of_listing_id !== null) {
            $primary = RadarListing::query()->whereKey($listing->duplicate_of_listing_id)->value('property_id');
            if ($primary !== null) {
                return (int) $primary;
            }
        }

        return $listing->duplicate_of_property_id;
    }
}
