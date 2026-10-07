<?php

namespace App\Services\Maintenance;

use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;

/**
 * TCK-592 — qui peut RECEVOIR une intervention, et qui la GARDE.
 *
 * `assigned_to` n'était validé que par `exists:users,id` : n'importe quel compte recevait la demande,
 * et avec elle le bien, le quartier et l'e-mail du demandeur. Et la policy ne lisait que
 * `assigned_to === $user->id` : une collaboration finie ou un profil suspendu ne retiraient rien.
 *
 * Est assignable, pour un bien d'agence (option retenue par défaut, non tranchée par le porteur) :
 *
 *  - un prestataire dont le `ServiceProviderProfile` est `active` ET qui a une collaboration `active`
 *    avec **l'agence du bien** ;
 *  - un membre de l'équipe de cette agence.
 *
 * Le MÊME prédicat garde l'accès du prestataire assigné (`view`, `update`, `actAsProvider`) :
 * collaboration finie ou profil suspendu = plus d'accès, historique compris — les données des
 * locataires priment (TCK-594 sert les factures par un autre chemin).
 *
 * Un bien sans agence n'a aucun prestataire assignable : aucune collaboration ne peut le viser.
 */
class ProviderEligibility
{
    public function isAssignable(User $user, ?Property $property): bool
    {
        $agencyId = $property?->agency_id;
        if ($agencyId === null) {
            return false;
        }

        return $this->isActiveProviderAt($user, (int) $agencyId)
            || $this->isStaffAt($user, (int) $agencyId);
    }

    public function isActiveProviderAt(User $user, int $agencyId): bool
    {
        return $this->activeCollaborations($user)->where('agency_id', $agencyId)->exists();
    }

    /**
     * Les agences où l'utilisateur peut tenir une intervention qui lui est assignée.
     *
     * @return list<int>
     */
    public function agencyIdsWhereAssignable(User $user): array
    {
        return $this->activeCollaborations($user)->pluck('agency_id')
            ->merge($this->staffAgencyIds($user))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Le prédicat « personnel de l'agence » de TCK-587 (ADR-0031 §1) : profil agent ou admin ACTIF,
     * ou délégation active de l'un de ces rôles. Un agent suspendu n'est ni assignable ni assigné.
     */
    public function isStaffAt(User $user, int $agencyId): bool
    {
        return app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId);
    }

    /**
     * Les agences où le même prédicat répond vrai : les candidates (profils et délégations, tous
     * états) passent chacune par {@see self::isStaffAt()}, seul juge.
     *
     * @return list<int>
     */
    public function staffAgencyIds(User $user): array
    {
        return $user->agentProfiles()->pluck('agency_id')
            ->merge($user->agencyAdminProfiles()->pluck('agency_id'))
            ->merge($user->roleDelegations()->pluck('agency_id'))
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->filter(fn (int $id): bool => $this->isStaffAt($user, $id))
            ->values()
            ->all();
    }

    private function activeCollaborations(User $user)
    {
        return ServiceProviderAgencyCollaboration::query()
            ->where('status', CollaborationStatus::Active->value)
            ->whereHas('serviceProviderProfile', fn ($q) => $q
                ->where('user_id', $user->id)
                ->where('status', ServiceProviderProfileStatus::Active->value));
    }
}
