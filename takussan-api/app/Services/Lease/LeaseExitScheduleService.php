<?php

namespace App\Services\Lease;

use App\Exceptions\ApiError;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * TCK-1151 (P81.01) — à la sortie du locataire (résiliation immédiate, confirmation de la
 * résiliation anticipée), les échéances de loyer dont la période commence APRÈS la date de sortie
 * ne sont plus dues : elles passent `cancelled`, tracées dans `activity_log`
 * (`lease_termination_schedule_cancelled`). Avant, elles restaient `pending` : pénalité de retard,
 * relance et paiement en ligne continuaient après le départ (`docs/models-spec.md` § 14 : le loyer
 * reste dû jusqu'à la date d'effet, pas au-delà).
 *
 * Mêmes règles que la relève d'un renouvellement (`LeaseRenewalService::handOver`) :
 * - une échéance postérieure déjà engagée (réglée, en partie réglée, pénalité payée, checkout
 *   ouvert) ne s'annule pas en silence : 409 `lease.termination_overlaps_paid_schedule`, avec les
 *   échéances en cause, et la sortie est refusée ; le remboursement reste un geste humain ;
 * - seules les échéances `pending`, `late` et `failed` s'annulent.
 *
 * L'échéance à cheval sur la date de sortie (période commencée au plus tard ce jour-là) reste due
 * en entier : aucun prorata, choix le plus étroit de la piste.
 *
 * L'appelant tient le verrou de la ligne du bail, dans sa transaction.
 */
class LeaseExitScheduleService
{
    public function __construct(private readonly LeaseRenewalService $renewals) {}

    public function cancelAfterExit(Lease $lease, CarbonInterface $exitDate, ?User $actor): void
    {
        // Une échéance déjà annulée ou remboursée ne compte plus.
        $dues = $this->rentDuesAfter($lease, $exitDate)
            ->reject(fn (LeasePayment $due) => in_array($due->status, [PaymentStatus::Cancelled, PaymentStatus::Refunded], true));

        $engaged = $dues
            ->filter(fn (LeasePayment $due) => $this->renewals->isEngaged($due))
            ->map(fn (LeasePayment $due) => [
                'id' => $due->id,
                'reference_number' => $due->reference_number,
                'due_date' => $due->due_date?->toDateString(),
                'status' => $due->status instanceof PaymentStatus ? $due->status->value : $due->status,
            ])
            ->values()
            ->all();

        if ($engaged !== []) {
            throw (new ApiError(409, 'lease.termination_overlaps_paid_schedule'))->with(['payments' => $engaged]);
        }

        $cancelled = [];
        foreach ($dues as $due) {
            if (in_array($due->status, LeaseRenewalService::CANCELLABLE_DUE_STATUSES, true)) {
                $due->update(['status' => PaymentStatus::Cancelled]);
                $cancelled[] = $due->reference_number;
            }
        }

        if ($cancelled !== []) {
            activity('Lease')
                ->performedOn($lease)
                ->causedBy($actor)
                ->withProperties(['exit_date' => $exitDate->toDateString(), 'cancelled' => $cancelled])
                ->event('lease_termination_schedule_cancelled')
                ->log('lease_termination_schedule_cancelled');
        }
    }

    /**
     * Les échéances de loyer dont la période commence après la date de sortie (à défaut de
     * période, l'échéance elle-même).
     *
     * @return Collection<int, LeasePayment>
     */
    private function rentDuesAfter(Lease $lease, CarbonInterface $exitDate): Collection
    {
        $exit = $exitDate->toDateString();

        return LeasePayment::query()
            ->where('lease_id', $lease->id)
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->where(function ($q) use ($exit) {
                $q->whereDate('period_start', '>', $exit)
                    ->orWhere(fn ($q) => $q->whereNull('period_start')->whereDate('due_date', '>', $exit));
            })
            ->orderBy('due_date')
            ->lockForUpdate()
            ->get();
    }
}
