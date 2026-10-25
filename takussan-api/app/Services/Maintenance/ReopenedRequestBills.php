<?php

namespace App\Services\Maintenance;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\ServiceProviderBill;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Payout\PayoutApprovers;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2270 (P224.01, ADR-0039 § 8, amendement du 2026-10-25) — la facture d'une intervention qui
 * quitte le travail rendu (contestation) ou qui est annulée.
 *
 * Sous le verrou de la demande puis de ses factures ouvertes :
 *  - `pending_validation`, ou `validated` sans reversement vivant au prestataire et non imputée à un
 *    reversement au bailleur → `cancelled`. La fin des travaux suivante en fait naître une neuve, au
 *    coût et au prestataire du moment ;
 *  - payée, imputée ou en cours de paiement → elle reste : un geste d'argent ne se défait pas en
 *    silence. Les membres de l'agence qui gèrent les factures (`payouts.create`) en sont avisés,
 *    après le commit, et la reprennent à la main.
 *
 * Une demande revenue au travail rendu entre-temps n'est pas touchée.
 */
final class ReopenedRequestBills
{
    public function __construct(
        private readonly PayoutApprovers $members,
        private readonly NotificationService $notifications,
    ) {}

    public function settle(MaintenanceRequest $request): void
    {
        /** @var Collection<int, ServiceProviderBill> $kept */
        $kept = DB::transaction(function () use ($request): Collection {
            $fresh = MaintenanceRequest::query()->whereKey($request->getKey())->lockForUpdate()->first();
            if ($fresh === null || in_array($fresh->status, ServiceProviderBill::BILLABLE_REQUEST_STATUSES, true)) {
                return collect();
            }

            $open = ServiceProviderBill::query()
                ->where('maintenance_request_id', $fresh->id)
                ->whereNotIn('status', [ServiceProviderBillStatus::Rejected->value, ServiceProviderBillStatus::Cancelled->value])
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            return $open->reject(function (ServiceProviderBill $bill): bool {
                if (! $this->committed($bill)) {
                    $bill->update(['status' => ServiceProviderBillStatus::Cancelled]);

                    return true;
                }

                return false;
            })->values();
        });

        foreach ($kept as $bill) {
            $this->notify($bill, $request);
        }
    }

    /** Un geste d'argent la tient : payée, imputée au bailleur, ou dans un reversement vivant. */
    private function committed(ServiceProviderBill $bill): bool
    {
        if ($bill->status === ServiceProviderBillStatus::PendingValidation) {
            return false;
        }

        return $bill->status === ServiceProviderBillStatus::Paid
            || $bill->imputed_payout_id !== null
            || Payout::query()
                ->where('service_provider_bill_id', $bill->id)
                ->whereIn('status', array_map(fn (PayoutStatus $s) => $s->value, PayoutStatus::holdingItems()))
                ->exists();
    }

    private function notify(ServiceProviderBill $bill, MaintenanceRequest $request): void
    {
        $agency = $bill->agency_id !== null ? Agency::query()->find($bill->agency_id) : null;
        if ($agency === null) {
            return;
        }

        $params = [
            'reference' => $bill->reference_number,
            'amount' => NotificationRenderer::money($bill->amount, $bill->currency),
            'request' => (string) $request->title,
        ];
        $target = NotificationTarget::of('service_provider_bills')->forAgency($agency->id);

        foreach ($this->members->holders($agency, Capability::PayoutsCreate) as $member) {
            $this->notifications->send($member, NotificationCode::ServiceProviderBillKeptOnReopen, $params, $target);
        }
    }
}
