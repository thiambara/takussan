<?php

namespace App\Services\Agency;

use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Permissions\RoleDelegationService;
use App\Support\FinInclusive;
use Carbon\CarbonInterface;
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
 *
 * TCK-2666 (ADR-0035, amendement du 2026-11-10) — elle peut porter une délégation de rôle LIÉE
 * (`substitute_can_act`) : le rôle de base de l'absent prêté au remplaçant, sur la même période,
 * créé et modifié ici, révoqué, activé et expiré avec elle par `RoleDelegationService`. Le droit
 * vient de cette délégation, jamais de l'absence.
 */
class AgentAbsenceService
{
    public function __construct(private readonly RoleDelegationService $delegations) {}

    /**
     * @param  array{user_id: int, substitute_id: int, starts_at?: ?string, ends_at: string, reason?: ?string, substitute_can_act?: bool}  $data
     */
    public function declare(Agency $agency, User $actor, array $data): RoleDelegation
    {
        $absent = User::query()->findOrFail((int) $data['user_id']);
        $substitute = User::query()->findOrFail((int) $data['substitute_id']);

        if ($absent->id === $substitute->id) {
            throw ValidationException::withMessages(['substitute_id' => __('team_handover.absences.same_person')]);
        }
        // TCK-1097 — le remplaçant reçoit les tâches de l'absent : il est aussi joignable
        // (`PersonnelDeLAgence::estPersonnel()`). L'absent n'est jugé que personnel.
        $staff = [
            'user_id' => $this->isStaffAt($absent, (int) $agency->id),
            'substitute_id' => PersonnelDeLAgence::estPersonnel($substitute, (int) $agency->id),
        ];
        foreach ($staff as $field => $ok) {
            if (! $ok) {
                throw ValidationException::withMessages([$field => __('team_handover.absences.not_staff')]);
            }
        }

        $startsAt = isset($data['starts_at']) ? Carbon::parse($data['starts_at']) : null;
        // Une date seule vaut la fin du jour choisi, heure de Dakar, comme pour la délégation (TCK-1455).
        $endsAt = Carbon::parse(FinInclusive::de($data['ends_at']));
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
            abort_code_if($overlaps, 422, 'agent_absence.overlaps');

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

            // TCK-2666 — dans la même transaction : un refus de la délégation n'écrit pas l'absence.
            $cover = ($data['substitute_can_act'] ?? false) === true
                ? $this->createCover($agency, $actor, $absence, $absent)
                : null;

            activity()
                ->causedBy($actor)
                ->performedOn($absence)
                ->withProperties(['absent_id' => $absent->id, 'substitute_id' => $substitute->id, 'agency_id' => $agency->id, 'delegation_id' => $cover?->id])
                ->event('absence.declared')
                ->log('absence.declared');

            return $absence;
        });
    }

    /**
     * TCK-2666 (ADR-0035, amendement du 2026-11-10) — modifier une absence en cours ou planifiée : ses
     * dates, son remplaçant, son motif, et le droit d'agir du remplaçant. La délégation liée suit :
     * mêmes dates ; un autre remplaçant, ou le droit retiré, la révoque (et un autre remplaçant en
     * reçoit une neuve) ; le droit rendu en crée une. Le début d'une absence commencée ne bouge plus.
     *
     * @param  array{starts_at?: ?string, ends_at?: string, substitute_id?: int, substitute_can_act?: bool, reason?: ?string}  $data
     */
    public function update(RoleDelegation $absence, User $actor, array $data): RoleDelegation
    {
        return DB::transaction(function () use ($absence, $actor, $data): RoleDelegation {
            // TCK-2746 (TCK-2744 d4) — l'ordre du dépôt, bien → visite → utilisateur → délégation
            // (`takussan-api/CLAUDE.md`, piège n° 10) : l'absent, lu sans verrou (`replaces_user_id`
            // ne change jamais), est verrouillé AVANT la délégation. L'ordre inverse s'interbloquait
            // avec le retrait d'un membre et l'effacement d'un compte, qui verrouillent `users` puis
            // révoquent ses délégations.
            /** @var User $absent */
            $absent = User::query()->findOrFail(
                RoleDelegation::query()->whereKey($absence->getKey())->firstOrFail(['replaces_user_id'])->replaces_user_id,
            );
            // Même point de sérialisation que la déclaration : la ligne de l'absent.
            User::query()->whereKey($absent->id)->lockForUpdate()->first();
            $locked = RoleDelegation::query()->whereKey($absence->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->isLive(), 422, 'agent_absence.closed');

            $agency = Agency::query()->findOrFail($locked->agency_id);

            $changed = [];
            $startsAt = $locked->starts_at;
            if (array_key_exists('starts_at', $data)) {
                $new = $data['starts_at'] === null ? null : Carbon::parse($data['starts_at']);
                if (! $this->sameInstant($new, $locked->starts_at)) {
                    if ($locked->status === RoleDelegationStatus::Active) {
                        throw ValidationException::withMessages(['starts_at' => __('team_handover.absences.already_started')]);
                    }
                    $startsAt = $new;
                    $changed[] = 'starts_at';
                }
            }
            $endsAt = $locked->ends_at;
            if (array_key_exists('ends_at', $data)) {
                $new = Carbon::parse(FinInclusive::de($data['ends_at']));
                if (! $new->equalTo($endsAt)) {
                    $endsAt = $new;
                    $changed[] = 'ends_at';
                }
            }
            if ($endsAt->lte($startsAt ?? now())) {
                throw ValidationException::withMessages(['ends_at' => __('team_handover.absences.ends_before_start')]);
            }

            $substituteId = (int) $locked->user_id;
            if (array_key_exists('substitute_id', $data) && (int) $data['substitute_id'] !== $substituteId) {
                $substitute = User::query()->findOrFail((int) $data['substitute_id']);
                if ($substitute->id === $absent->id) {
                    throw ValidationException::withMessages(['substitute_id' => __('team_handover.absences.same_person')]);
                }
                if (! PersonnelDeLAgence::estPersonnel($substitute, (int) $agency->id)) {
                    throw ValidationException::withMessages(['substitute_id' => __('team_handover.absences.not_staff')]);
                }
                $substituteId = (int) $substitute->id;
                $changed[] = 'substitute_id';
            }
            if (array_key_exists('reason', $data) && $data['reason'] !== $locked->reason) {
                $changed[] = 'reason';
            }

            if (array_intersect($changed, ['starts_at', 'ends_at']) !== []) {
                $from = $startsAt ?? now();
                $overlaps = RoleDelegation::query()
                    ->absences()
                    ->where('agency_id', $agency->id)
                    ->where('replaces_user_id', $absent->id)
                    ->whereKeyNot($locked->getKey())
                    ->whereIn('status', [RoleDelegationStatus::Scheduled, RoleDelegationStatus::Active])
                    ->where('ends_at', '>', $from)
                    ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<', $endsAt))
                    ->exists();
                abort_code_if($overlaps, 422, 'agent_absence.overlaps');
            }

            $locked->update([
                'user_id' => $substituteId,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'reason' => array_key_exists('reason', $data) ? $data['reason'] : $locked->reason,
            ]);

            $cover = RoleDelegation::query()
                ->where('covers_absence_id', $locked->getKey())
                ->whereIn('status', [RoleDelegationStatus::Scheduled, RoleDelegationStatus::Active])
                ->lockForUpdate()
                ->first();
            $canAct = array_key_exists('substitute_can_act', $data) ? (bool) $data['substitute_can_act'] : $cover !== null;
            if ($canAct !== ($cover !== null)) {
                $changed[] = 'substitute_can_act';
            }

            if ($cover !== null && (! $canAct || $cover->user_id !== $substituteId)) {
                $this->delegations->revoke($cover, $actor);
                $cover = null;
            }
            if ($cover !== null) {
                $cover->update(['starts_at' => $startsAt, 'ends_at' => $endsAt]);
            } elseif ($canAct) {
                $cover = $this->createCover($agency, $actor, $locked, $absent);
            }

            // Une absence planifiée ramenée à maintenant commence ; sa délégation avec elle.
            if ($locked->status === RoleDelegationStatus::Scheduled && ($startsAt === null || now()->gte($startsAt))) {
                $this->delegations->activate($locked);
            }

            if ($changed !== []) {
                activity()
                    ->causedBy($actor)
                    ->performedOn($locked)
                    ->withProperties(['changed' => $changed, 'agency_id' => $agency->id, 'delegation_id' => $cover?->id])
                    ->event('absence.updated')
                    ->log('absence.updated');
            }

            return $locked->fresh();
        });
    }

    /**
     * TCK-2666 — la délégation liée : le rôle de BASE de l'absent dans l'agence (`agency_admin`, sinon
     * `agent`), jamais un autre, au remplaçant, sur la période de l'absence, par l'auteur du geste.
     * Les refus de `RoleDelegationService::create()` (délégation à soi-même, remplaçant sans profil
     * d'agent, administrateur principal) sont rendus sur `substitute_can_act`, le champ qui les cause.
     * Le motif de l'absence n'est pas recopié : il peut être une donnée de santé, et la délégation se
     * lit sur la page Rôles.
     */
    private function createCover(Agency $agency, User $actor, RoleDelegation $absence, User $absent): RoleDelegation
    {
        $role = match (true) {
            $absent->isAgencyAdminAt((int) $agency->id) => 'agency_admin',
            $absent->isAgentAt((int) $agency->id) => 'agent',
            default => throw ValidationException::withMessages(['substitute_can_act' => __('team_handover.absences.no_base_role')]),
        };

        try {
            return $this->delegations->create($agency, $actor, [
                'user_id' => $absence->user_id,
                'role' => $role,
                'starts_at' => $absence->starts_at,
                'ends_at' => $absence->ends_at,
                'covers_absence_id' => $absence->id,
            ]);
        } catch (ValidationException $e) {
            throw ValidationException::withMessages(['substitute_can_act' => collect($e->errors())->flatten()->all()]);
        }
    }

    private function sameInstant(?CarbonInterface $a, ?CarbonInterface $b): bool
    {
        return $a === null || $b === null ? $a === $b : $a->equalTo($b);
    }

    /** La révocation est celle d'une délégation : mêmes statut, événement (ignoré par les notifications) et journal. */
    public function revoke(RoleDelegation $absence, User $actor): void
    {
        $this->delegations->revoke($absence, $actor);
    }

    /** TCK-587 — PERSONNEL actif de l'agence (profil ou délégation actifs). */
    private function isStaffAt(User $user, int $agencyId): bool
    {
        return app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId);
    }
}
