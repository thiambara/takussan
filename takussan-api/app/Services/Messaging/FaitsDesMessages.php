<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ConversationType;
use App\Models\Message;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use Carbon\CarbonInterface;

/**
 * TCK-2858 — ce qu'un message du fil dit À SON LECTEUR, calculé UNE fois par requête (jamais par
 * message : le nombre de requêtes ne dépend pas de la taille de la page).
 *
 *  - **Lu** (`read_by_recipient`, fil `direct`) : sur les seuls messages de l'appelant, vrai quand le
 *    `last_read_at` de l'autre participant n'est pas ANTÉRIEUR au `created_at` du message — la règle
 *    des non-lus de la liste (`ConversationController::index`, `last_read_at < created_at` = non lu),
 *    retournée : lu dans la même seconde vaut lu. `null` sur un message reçu.
 *  - **Lecteurs** (`read_count`, fil `group`) : sur les seuls messages de l'appelant, le nombre des
 *    AUTRES participants actuels (sans `left_at`) qui l'ont lu, même règle.
 *  - **Rôle de l'auteur** (`sender.role_label_code`, fil `group`) : un CODE (principe 5) —
 *    `tenant`, `owner`, `agent`, `agency_admin`, `service_provider`, `customer` — dérivé de la relation
 *    de la personne au contexte du fil par {@see RelationsAuFil}, donc jugé sur ce que l'APPELANT peut
 *    lire : un prestataire, qui ne lit pas le bail, n'apprend pas qui est locataire par ce biais.
 *    `agent` devient `agency_admin` quand la personne est administratrice active d'une agence du fil ;
 *    sans relation, `customer` si l'appelant est du personnel d'une agence du fil où la personne a une
 *    fiche CRM, sinon `null`. Les anciens membres (partis du groupe) gardent le rôle de leurs messages.
 */
final class FaitsDesMessages
{
    public const ROLES = [
        RelationsAuFil::PRESTATAIRE => 'service_provider',
        RelationsAuFil::LOCATAIRE => 'tenant',
        RelationsAuFil::PROPRIETAIRE => 'owner',
        RelationsAuFil::AGENT => 'agent',
    ];

    /**
     * @param  list<CarbonInterface|null>  $lecturesDesAutres  `last_read_at` des autres participants retenus
     * @param  array<int, string>  $roles  user_id → code
     */
    private function __construct(
        private readonly int $lecteurId,
        private readonly bool $direct,
        private readonly array $lecturesDesAutres,
        private readonly array $roles,
    ) {}

    public static function pour(User $lecteur, Conversation $fil): self
    {
        $direct = $fil->type === ConversationType::Direct;
        // Tous les participants, anciens compris : un message d'un membre parti garde son rôle.
        $tous = $fil->participants()->get();
        $autres = $tous->reject(fn (User $u) => (int) $u->id === (int) $lecteur->id);
        if (! $direct) {
            $autres = $autres->filter(fn (User $u) => $u->pivot->left_at === null);
        }

        $lectures = $autres->map(fn (User $u) => $u->pivot->last_read_at)->values()->all();
        // Une directe a un seul autre participant ; à défaut, aucune coche ne s'affirme.
        if ($direct && count($lectures) !== 1) {
            $lectures = [];
        }

        return new self(
            (int) $lecteur->id,
            $direct,
            $lectures,
            $direct ? [] : self::roles($lecteur, $fil, $tous->all()),
        );
    }

    public function luParLeDestinataire(Message $message): ?bool
    {
        if (! $this->direct || (int) $message->sender_id !== $this->lecteurId) {
            return null;
        }
        $lu = $this->lecturesDesAutres[0] ?? null;

        return $lu !== null && $message->created_at !== null && $lu->gte($message->created_at);
    }

    public function nombreDeLecteurs(Message $message): ?int
    {
        if ($this->direct || (int) $message->sender_id !== $this->lecteurId || $message->created_at === null) {
            return null;
        }

        return count(array_filter(
            $this->lecturesDesAutres,
            fn (?CarbonInterface $lu) => $lu !== null && $lu->gte($message->created_at),
        ));
    }

    public function roleDe(?int $userId): ?string
    {
        return $userId === null ? null : ($this->roles[$userId] ?? null);
    }

    /**
     * @param  list<User>  $tous
     * @return array<int, string>
     */
    private static function roles(User $lecteur, Conversation $fil, array $tous): array
    {
        $fil->loadMissing([
            'property',
            'lease.tenant',
            'lease.property',
            'maintenanceRequest.property',
            'maintenanceRequest.lease.tenant',
        ]);
        $bail = $fil->lease !== null && $lecteur->can('view', $fil->lease) ? $fil->lease : null;
        $intervention = $fil->maintenanceRequest !== null && $lecteur->can('view', $fil->maintenanceRequest) ? $fil->maintenanceRequest : null;

        // RelationsAuFil lit `participants` : ici, tous les membres, anciens compris, sur une copie.
        $copie = clone $fil;
        $copie->setRelation('participants', collect($tous));

        $roles = [];
        foreach (RelationsAuFil::pour($lecteur, $copie, $bail, $intervention) as $ligne) {
            $roles[(int) $ligne['user_id']] = self::ROLES[$ligne['relation']];
        }

        $agences = array_values(array_unique(array_filter([
            $bail?->agency_id,
            $intervention?->property?->agency_id,
            $fil->property?->agency_id,
        ], fn ($id) => $id !== null)));
        if ($agences === []) {
            return $roles;
        }

        $agents = array_keys(array_filter($roles, fn (string $code) => $code === 'agent'));
        if ($agents !== []) {
            AgencyAdminProfile::query()->active()
                ->whereIn('agency_id', $agences)
                ->whereIn('user_id', $agents)
                ->pluck('user_id')
                ->each(function ($id) use (&$roles): void {
                    $roles[(int) $id] = 'agency_admin';
                });
        }

        $sansRole = array_values(array_diff(array_map(fn (User $u) => (int) $u->id, $tous), array_keys($roles)));
        $agenceDuLecteur = $lecteur->staffAgencyId();
        if ($sansRole !== [] && $agenceDuLecteur !== null && in_array((int) $agenceDuLecteur, array_map('intval', $agences), true)) {
            Customer::query()
                ->where('agency_id', $agenceDuLecteur)
                ->whereIn('user_id', $sansRole)
                ->pluck('user_id')
                ->each(function ($id) use (&$roles): void {
                    $roles[(int) $id] = 'customer';
                });
        }

        return $roles;
    }
}
