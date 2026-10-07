<?php

namespace App\Services\Agency;

use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-591 (ADR-0035) — déclarer et révoquer l'absence d'un membre du personnel.
 *
 * Une absence est une ligne de `role_delegations` (`replaces_user_id` = l'absent, `user_id` = le
 * remplaçant, rôle `absence_cover`) : elle reprend le cycle de vie des délégations — statut,
 * activation et expiration par `ProcessRoleDelegationsJob` — et n'accorde AUCUNE capacité. Elle ne
 * réécrit aucune ligne existante : la fin de l'absence suffit à tout rendre.
 */
class AgentAbsenceService
{
    public function __construct(private readonly RoleDelegationService $delegations) {}

    /**
     * @param  array{user_id: int, substitute_id: int, starts_at?: ?string, ends_at: string, reason?: ?string}  $data
     */
    public function declare(Agency $agency, User $actor, array $data): RoleDelegation
    {
        $absent = User::query()->findOrFail((int) $data['user_id']);
        $substitute = User::query()->findOrFail((int) $data['substitute_id']);

        if ($absent->id === $substitute->id) {
            throw ValidationException::withMessages(['substitute_id' => __('team_handover.absences.same_person')]);
        }
        foreach (['user_id' => $absent, 'substitute_id' => $substitute] as $field => $member) {
            if (! $this->isStaffAt($member, (int) $agency->id)) {
                throw ValidationException::withMessages([$field => __('team_handover.absences.not_staff')]);
            }
        }

        $startsAt = isset($data['starts_at']) ? Carbon::parse($data['starts_at']) : null;
        $endsAt = Carbon::parse($data['ends_at']);
        $isImmediate = $startsAt === null || now()->gte($startsAt);

        return DB::transaction(function () use ($agency, $actor, $absent, $substitute, $startsAt, $endsAt, $isImmediate, $data) {
            // Le chevauchement se juge sous verrou de la ligne parent (l'absent) : deux déclarations
            // concurrentes ne passent pas toutes deux (piège PostgreSQL n°2 de CLAUDE.md).
            User::query()->whereKey($absent->id)->lockForUpdate()->first();

            $from = $startsAt ?? now();
            $overlaps = RoleDelegation::query()
                ->absences()
                ->where('agency_id', $agency->id)
                ->where('replaces_user_id', $absent->id)
                ->whereIn('status', [RoleDelegationStatus::Scheduled, RoleDelegationStatus::Active])
                ->where('ends_at', '>', $from)
                ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<', $endsAt))
                ->exists();
            if ($overlaps) {
                throw new HttpResponseException(response()->json([
                    'code' => 'absence_overlaps',
                    'message' => __('team_handover.absences.overlaps'),
                ], 422));
            }

            $absence = RoleDelegation::query()->create([
                'user_id' => $substitute->id,
                'replaces_user_id' => $absent->id,
                'delegator_id' => $actor->id,
                'agency_id' => $agency->id,
                'role' => RoleDelegation::ABSENCE_ROLE,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'status' => $isImmediate ? RoleDelegationStatus::Active : RoleDelegationStatus::Scheduled,
                'reason' => $data['reason'] ?? null,
                'user_native_roles_snapshot' => [],
                'activated_at' => $isImmediate ? now() : null,
            ]);

            activity()
                ->causedBy($actor)
                ->performedOn($absence)
                ->withProperties(['absent_id' => $absent->id, 'substitute_id' => $substitute->id, 'agency_id' => $agency->id])
                ->log('absence.declared');

            return $absence;
        });
    }

    /** La révocation est celle d'une délégation : mêmes statut, événement (ignoré par les notifications) et journal. */
    public function revoke(RoleDelegation $absence, User $actor): void
    {
        $this->delegations->revoke($absence, $actor);
    }

    /** TCK-587 — prédicat « personnel de l'agence » ; `isStaffAt()` à sa fusion. */
    private function isStaffAt(User $user, int $agencyId): bool
    {
        return $user->isAgentAt($agencyId) || $user->isAgencyAdminAt($agencyId);
    }
}
