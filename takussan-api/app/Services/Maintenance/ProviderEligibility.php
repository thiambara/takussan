<?php

namespace App\Services\Maintenance;

use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Property;
use App\Models\User;

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
     * TCK-587 — à remplacer par `MembershipCapabilityResolver::isStaffAt()` (prédicat « personnel de
     * l'agence ») à la fusion de 587 dans `dev`.
     */
    public function isStaffAt(User $user, int $agencyId): bool
    {
        return $user->isAgentAt($agencyId) || $user->isAgencyAdminAt($agencyId);
    }

    /**
     * TCK-587 — idem : les agences où le prédicat du personnel répond vrai.
     *
     * @return list<int>
     */
    public function staffAgencyIds(User $user): array
    {
        return $user->agentProfiles()->pluck('agency_id')
            ->merge($user->agencyAdminProfiles()->pluck('agency_id'))
            ->map(fn ($id) => (int) $id)
            ->unique()
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
