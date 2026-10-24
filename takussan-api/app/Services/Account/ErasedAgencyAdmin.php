<?php

namespace App\Services\Account;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * TCK-2166 (P204.02, décision du porteur du 2026-10-24) — l'agence dont le compte effacé est un
 * administrateur actif ou l'administrateur principal (`primary_admin_id`) :
 *
 *  - espace `individual`, ou agence sans autre membre actif (personnel ou bailleur, la règle de
 *    `MembershipCapabilityResolver::isMemberAt()`) : l'agence passe `inactive` à l'exécution ;
 *  - un autre administrateur actif : `primary_admin_id` lui passe à l'exécution, si c'était le
 *    compte effacé ;
 *  - d'autres membres, mais aucun autre administrateur : une OBLIGATION, qui retient la demande
 *    comme le retrait retient `cannot_remove_last_admin`. Le compte la lève en promouvant un membre.
 */
class ErasedAgencyAdmin
{
    public const DEACTIVATE = 'deactivate';

    public const TRANSFER = 'transfer';

    public const SUCCESSION = 'succession';

    /**
     * @return Collection<int, array{agency: Agency, outcome: string, successor: ?int}>
     */
    public function plan(User $user): Collection
    {
        $adminAgencyIds = AgencyAdminProfile::query()->where('user_id', $user->id)->active()->pluck('agency_id');

        return Agency::query()
            ->where(fn ($q) => $q->whereIn('id', $adminAgencyIds)->orWhere('primary_admin_id', $user->id))
            ->orderBy('id')
            ->get()
            ->map(function (Agency $agency) use ($user): ?array {
                $isPrimary = (int) $agency->primary_admin_id === (int) $user->id;
                $otherAdmin = AgencyAdminProfile::query()
                    ->where('agency_id', $agency->id)
                    ->where('user_id', '!=', $user->id)
                    ->active()
                    ->orderBy('id')
                    ->value('user_id');

                if ($agency->kind === AgencyKind::Individual || ! $this->hasOtherMember($agency, $user)) {
                    return ['agency' => $agency, 'outcome' => self::DEACTIVATE, 'successor' => null];
                }
                if ($otherAdmin !== null) {
                    return $isPrimary
                        ? ['agency' => $agency, 'outcome' => self::TRANSFER, 'successor' => (int) $otherAdmin]
                        : null;
                }

                return ['agency' => $agency, 'outcome' => self::SUCCESSION, 'successor' => null];
            })
            ->filter()
            ->values();
    }

    /** @return Collection<int, Agency> les agences qui retiennent l'effacement */
    public function successionsDue(User $user): Collection
    {
        return $this->plan($user)->where('outcome', self::SUCCESSION)->pluck('agency')->values();
    }

    /**
     * À l'exécution, AVANT la fin des profils du compte. Une succession encore due à cette date
     * (un autre admin retiré pendant le délai de grâce) ne bloque plus rien : elle est journalisée.
     */
    public function settle(User $user): void
    {
        foreach ($this->plan($user) as $step) {
            /** @var Agency $agency */
            $agency = $step['agency'];
            $previous = ['status' => $agency->status?->value, 'primary_admin_id' => $agency->primary_admin_id];

            if ($step['outcome'] === self::DEACTIVATE) {
                $agency->forceFill(['status' => AgencyStatus::Inactive])->save();
            } elseif ($step['outcome'] === self::TRANSFER) {
                $agency->forceFill(['primary_admin_id' => $step['successor']])->save();
            }

            activity('Agency')
                ->performedOn($agency)
                ->withProperties($previous + ['erased_user_id' => $user->id, 'outcome' => $step['outcome'], 'successor_id' => $step['successor']])
                ->event('agency.admin_erased')
                ->log('agency.admin_erased');
        }
    }

    private function hasOtherMember(Agency $agency, User $user): bool
    {
        foreach ([AgencyAdminProfile::class, AgentProfile::class, OwnerProfile::class] as $class) {
            if ($class::query()->where('agency_id', $agency->id)->where('user_id', '!=', $user->id)->active()->exists()) {
                return true;
            }
        }

        return false;
    }
}
