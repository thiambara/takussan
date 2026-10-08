<?php

namespace App\Services\Payout;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Support\SegregationOfDuties;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §4) — le seuil des quatre yeux d'agence, que l'agence active elle-même.
 *
 * Un seuil n'a de sens qu'avec deux personnes pour le tenir : l'activer dans une agence qui n'a
 * qu'un détenteur de `payouts.approve` bloquerait tout reversement au-dessus (l'émetteur ne
 * s'approuve pas).
 *
 * **Le relâcher demande deux personnes aussi** (VERIF-594 M-2). Celui qui allait payer coupait le
 * seuil seul, payait seul, puis le remettait. Un changement qui RELÂCHE le contrôle — passage à
 * `null`, ou hausse — reste en attente jusqu'à la confirmation d'un second détenteur, qui est avisé
 * aussitôt ; une agence qui n'a qu'un détenteur ne le relâche pas (403). Un RESSERREMENT — activation,
 * baisse — reste immédiat, et remplace une demande en attente. Renvoyer la valeur en vigueur retire
 * la demande.
 *
 * Chaque changement appliqué écrit `agency_payout_threshold_changed` avec l'ancienne et la nouvelle
 * valeur ; une demande écrit `agency_payout_threshold_relax_requested`.
 */
final class PayoutApprovalThreshold
{
    public const APPLIED = 'applied';

    public const PENDING = 'pending';

    public const UNCHANGED = 'unchanged';

    /**
     * VERIF-594 passe 2, N-4 — une demande de relâchement expire au bout de 7 jours : confirmée
     * 90 jours plus tard, elle relâchait un contrôle sur une décision que plus personne ne portait.
     */
    public const REQUEST_TTL_DAYS = 7;

    public function __construct(private readonly PayoutApprovers $approvers) {}

    /** @return self::APPLIED|self::PENDING|self::UNCHANGED */
    public function change(Agency $agency, User $actor, mixed $value): string
    {
        $new = $value === null || $value === '' ? null : round((float) $value, 2);

        $holders = $this->approvers->holders($agency);
        if ($new !== null) {
            abort_code_if($holders->count() < 2, 422, 'payout.threshold_needs_two_approvers');
        }

        $outcome = DB::transaction(function () use ($agency, $actor, $new, $holders): string {
            /** @var Agency $locked */
            $locked = Agency::query()->whereKey($agency->id)->lockForUpdate()->firstOrFail();
            $old = $locked->payout_approval_threshold === null ? null : (float) $locked->payout_approval_threshold;

            if ($old === $new) {
                $locked->forceFill($this->noPending())->save();

                return self::UNCHANGED;
            }

            $relaxes = $old !== null && ($new === null || $new > $old);
            if (! $relaxes) {
                $locked->forceFill(['payout_approval_threshold' => $new] + $this->noPending())->save();
                $this->trace($locked, $actor, $old, $new);

                return self::APPLIED;
            }

            abort_code_if($holders->count() < 2, 403, 'payout.threshold_needs_second_approver');

            $locked->forceFill([
                'pending_payout_threshold' => $new,
                'pending_payout_threshold_requested_by_id' => $actor->id,
                'pending_payout_threshold_requested_at' => now(),
            ])->save();

            activity()
                ->causedBy($actor)
                ->performedOn($locked)
                ->event('agency_payout_threshold_relax_requested')
                ->withProperties(['old' => $old, 'new' => $new])
                ->log('agency_payout_threshold_relax_requested');

            return self::PENDING;
        });

        if ($outcome === self::PENDING) {
            foreach ($holders->reject(fn (User $holder): bool => (int) $holder->id === (int) $actor->id) as $holder) {
                app(NotificationService::class)->send(
                    $holder,
                    NotificationCode::PayoutThresholdRelaxRequested,
                    ['agency' => $agency->name],
                    NotificationTarget::of('agency_settings'),
                );
            }
        }

        $agency->refresh();

        return $outcome;
    }

    /**
     * Le second geste : un AUTRE détenteur de `payouts.approve` confirme le relâchement demandé.
     * Le demandeur ne confirme pas sa propre demande.
     *
     * VERIF-594 passe 2, N-5 — il confirme la valeur qu'il a LUE (`$expected`, `null` pour une
     * coupure) : le demandeur qui remplace sa demande entre la lecture et la confirmation (150 000,
     * puis `null`) ne fait plus confirmer autre chose que ce que le second a vu (409).
     */
    public function confirm(Agency $agency, User $actor, mixed $expected): void
    {
        $expected = $expected === null || $expected === '' ? null : round((float) $expected, 2);

        $expired = DB::transaction(function () use ($agency, $actor, $expected): bool {
            /** @var Agency $locked */
            $locked = Agency::query()->whereKey($agency->id)->lockForUpdate()->firstOrFail();

            abort_code_if($locked->pending_payout_threshold_requested_at === null, 422, 'payout.no_pending_threshold_change');

            // N-4 — expirée, la demande est effacée (et l'effacement tracé) AVANT le refus : un
            // refus levé dans la transaction annulerait l'effacement.
            if (self::isExpired($locked->pending_payout_threshold_requested_at)) {
                activity()
                    ->causedBy($actor)
                    ->performedOn($locked)
                    ->event('agency_payout_threshold_relax_expired')
                    ->withProperties([
                        'requested_by' => $locked->pending_payout_threshold_requested_by_id,
                        'requested_at' => $locked->pending_payout_threshold_requested_at?->toIso8601String(),
                    ])
                    ->log('agency_payout_threshold_relax_expired');
                $locked->forceFill($this->noPending())->save();

                return true;
            }

            SegregationOfDuties::assertDistinct(
                $actor,
                [$locked->pending_payout_threshold_requested_by_id],
                SegregationOfDuties::STEP_APPROVE,
            );

            $old = $locked->payout_approval_threshold === null ? null : (float) $locked->payout_approval_threshold;
            $new = $locked->pending_payout_threshold === null ? null : (float) $locked->pending_payout_threshold;
            $requestedBy = $locked->pending_payout_threshold_requested_by_id;
            abort_code_if($new !== $expected, 409, 'payout.threshold_request_changed');

            $locked->forceFill(['payout_approval_threshold' => $new] + $this->noPending())->save();
            $this->trace($locked, $actor, $old, $new, $requestedBy);

            return false;
        });

        $agency->refresh();
        abort_code_if($expired, 422, 'payout.threshold_request_expired');
    }

    /** N-4 — une demande plus vieille que {@see self::REQUEST_TTL_DAYS} jours ne se confirme plus. */
    public static function isExpired(?CarbonInterface $requestedAt): bool
    {
        return $requestedAt !== null && $requestedAt->lt(now()->subDays(self::REQUEST_TTL_DAYS));
    }

    /** @return array<string, null> */
    private function noPending(): array
    {
        return [
            'pending_payout_threshold' => null,
            'pending_payout_threshold_requested_by_id' => null,
            'pending_payout_threshold_requested_at' => null,
        ];
    }

    private function trace(Agency $agency, User $actor, ?float $old, ?float $new, ?int $requestedBy = null): void
    {
        activity()
            ->causedBy($actor)
            ->performedOn($agency)
            ->event('agency_payout_threshold_changed')
            ->withProperties(array_filter(['old' => $old, 'new' => $new, 'requested_by' => $requestedBy], fn ($v, $k) => $k !== 'requested_by' || $v !== null, ARRAY_FILTER_USE_BOTH))
            ->log('agency_payout_threshold_changed');
    }
}
