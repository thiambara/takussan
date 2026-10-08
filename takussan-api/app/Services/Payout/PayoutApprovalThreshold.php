<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §4) — le seuil des quatre yeux d'agence, que l'agence active elle-même.
 *
 * Un seuil n'a de sens qu'avec deux personnes pour le tenir : l'activer dans une agence qui n'a
 * qu'un détenteur de `payouts.approve` bloquerait tout reversement au-dessus (l'émetteur ne
 * s'approuve pas). La règle se juge à l'activation ; la remise à `null` est toujours permise.
 *
 * Chaque changement accepté écrit `agency_payout_threshold_changed` avec l'ancienne et la nouvelle
 * valeur — c'est un réglage qui décide de qui peut sortir de l'argent seul.
 */
final class PayoutApprovalThreshold
{
    public function __construct(private readonly PayoutApprovers $approvers) {}

    public function change(Agency $agency, User $actor, mixed $value): void
    {
        $new = $value === null || $value === '' ? null : round((float) $value, 2);

        if ($new !== null) {
            abort_code_if(
                $this->approvers->holders($agency)->count() < 2,
                422,
                'payout.threshold_needs_two_approvers',
            );
        }

        DB::transaction(function () use ($agency, $actor, $new): void {
            /** @var Agency $locked */
            $locked = Agency::query()->whereKey($agency->id)->lockForUpdate()->firstOrFail();
            $old = $locked->payout_approval_threshold === null ? null : (float) $locked->payout_approval_threshold;

            if ($old === $new) {
                return;
            }

            $locked->forceFill(['payout_approval_threshold' => $new])->save();

            activity()
                ->causedBy($actor)
                ->performedOn($locked)
                ->event('agency_payout_threshold_changed')
                ->withProperties(['old' => $old, 'new' => $new])
                ->log('agency_payout_threshold_changed');
        });

        $agency->refresh();
    }
}
