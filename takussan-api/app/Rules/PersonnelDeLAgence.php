<?php

namespace App\Rules;

use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\User;
use App\Services\Property\PrimaryPropertyContact;
use BackedEnum;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-590 (contrainte 2) — `agent_id` d'une visite ne désigne que le PERSONNEL de l'agence du
 * bien : un agent ou un admin de cette agence, jamais un bailleur, un client, ni le compte d'une
 * autre agence.
 *
 * `exists:users,id` acceptait n'importe quel compte de la plateforme, qui devenait titulaire de
 * `update` sur la visite (`PropertyVisitPolicy`) : il la confirmait, la terminait, et lisait le
 * téléphone du visiteur. Un bien sans agence n'a aucun personnel : la visite reste non attribuée.
 *
 * {@see self::estPersonnel()} est le prédicat que les visites lisent partout (création,
 * planification, prise en charge, avis « agent »), pour qu'il ne s'en écrive qu'un.
 */
class PersonnelDeLAgence implements ValidationRule
{
    public function __construct(private readonly ?int $agencyId) {}

    /**
     * L'utilisateur est-il personnel ACTIF de cette agence : joignable (ni bloqué, ni supprimé),
     * et titulaire d'un profil agent ou admin de cette agence au statut `active` ?
     *
     * C'est LA définition du personnel pour tout le ticket — attribution, prise en charge,
     * planification, boîte des demandes, contact principal (`PrimaryPropertyContact`). Il y en
     * avait deux : le contact principal exigeait un profil actif, l'attribution non, et un agent
     * SUSPENDU recevait des visites et des demandes qu'il ne traiterait pas (vérification
     * adverse, M4). Les profils déjà chargés sont relus sans requête ; sinon la base est
     * interrogée.
     *
     * TCK-587 — à brancher sur `MembershipCapabilityResolver::isStaffAt()` après sa fusion, en
     * vérifiant qu'il filtre le statut du profil.
     */
    public static function estPersonnel(?User $user, mixed $agencyId): bool
    {
        if ($user === null || $agencyId === null || ! PrimaryPropertyContact::joignable($user)) {
            return false;
        }

        $agencyId = (int) $agencyId;

        return self::profilActif($user, 'agentProfiles', $agencyId, AgentProfileStatus::Active)
            || self::profilActif($user, 'agencyAdminProfiles', $agencyId, AgencyAdminProfileStatus::Active);
    }

    /**
     * Les agences où l'utilisateur est personnel actif — la même définition, en liste, pour une
     * clause d'`index`.
     *
     * @return list<int>
     */
    public static function agencesOuPersonnel(User $user): array
    {
        if (! PrimaryPropertyContact::joignable($user)) {
            return [];
        }

        return $user->agentProfiles()->where('status', AgentProfileStatus::Active->value)->pluck('agency_id')
            ->merge($user->agencyAdminProfiles()->where('status', AgencyAdminProfileStatus::Active->value)->pluck('agency_id'))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Vérification adverse (M7) — l'utilisateur est-il BAILLEUR actif de cette agence : joignable,
     * et titulaire d'un profil propriétaire de cette agence au statut `active` ? C'est ce qui fait
     * d'un `property.user_id` le propriétaire d'un bien d'agence (cf.
     * {@see PrimaryPropertyContact::estProprietaire()}).
     */
    public static function estBailleur(?User $user, mixed $agencyId): bool
    {
        if ($user === null || $agencyId === null || ! PrimaryPropertyContact::joignable($user)) {
            return false;
        }

        return self::profilActif($user, 'ownerProfiles', (int) $agencyId, OwnerProfileStatus::Active);
    }

    /**
     * Les agences où l'utilisateur est bailleur actif — en liste, pour une clause d'`index`.
     *
     * @return list<int>
     */
    public static function agencesOuBailleur(User $user): array
    {
        if (! PrimaryPropertyContact::joignable($user)) {
            return [];
        }

        return $user->ownerProfiles()->where('status', OwnerProfileStatus::Active->value)->pluck('agency_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    private static function profilActif(User $user, string $relation, int $agencyId, BackedEnum $actif): bool
    {
        if ($user->relationLoaded($relation)) {
            return $user->getRelation($relation)->contains(
                fn ($profil) => (int) $profil->agency_id === $agencyId && $profil->status === $actif,
            );
        }

        return $user->{$relation}()
            ->where('agency_id', $agencyId)
            ->where('status', $actif->value)
            ->exists();
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null) {
            return;
        }

        $user = is_numeric($value) ? User::query()->find((int) $value) : null;

        if (! self::estPersonnel($user, $this->agencyId)) {
            $fail(__('visits.agent_not_staff'));
        }
    }
}
