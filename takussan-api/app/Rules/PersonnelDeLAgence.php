<?php

namespace App\Rules;

use App\Models\User;
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
     * L'utilisateur est-il personnel de cette agence ?
     *
     * TCK-587 — `isAgentAt || isAgencyAdminAt` tant que le prédicat de 587
     * (`MembershipCapabilityResolver::isStaffAt()`) n'est pas sur cette branche.
     */
    public static function estPersonnel(?User $user, mixed $agencyId): bool
    {
        if ($user === null || $agencyId === null) {
            return false;
        }

        return $user->isAgentAt((int) $agencyId) || $user->isAgencyAdminAt((int) $agencyId);
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
