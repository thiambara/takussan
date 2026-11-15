<?php

namespace App\Services\Payments;

use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Model\LeaseService;
use App\Services\Reporting\OverdueInstalment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * TCK-2649 (ADR-0100) — ce que le locataire connecté doit, en un seul montant, et ce qui le compose.
 *
 * `GET /api/me/rent-summary`. Avant : la page « Paiements » lisait l'historique deux fois et
 * additionnait elle-même ; une pénalité restant due sur un loyer payé n'entrait dans aucun dû, et
 * rien ne distinguait « aucune échéance émise » de « tout est payé ».
 *
 * - **`total_due`** : le reste dû des échéances de loyer ET de charges (TCK-2679,
 *   {@see LeaseService::SCHEDULED_PERIOD_TYPES}) échues ou dues aujourd'hui, PLUS toutes les
 *   pénalités restant dues, y compris sur un loyer payé (décision 8 du porteur, 2026-11-10). La
 *   caution n'y est pas : elle n'est pas un terme périodique.
 * - **`parts.payable_online`** : la somme de `PaymentGatewayService::amountDue()` des échéances qui
 *   se paient en ligne — payables ET dont l'agence a un fournisseur actif, la porte du lien de
 *   paiement (`PublicPaymentLinkController`). La règle n'est pas réinventée : `amountDue` décide si
 *   la pénalité est encaissée en ligne. `payable_at_agency` est le reste : la somme des deux parts
 *   vaut `total_due` au centime.
 * - **`schedule_state`** : `due` s'il reste quelque chose ; sinon `none` si un bail en cours n'a
 *   AUCUNE échéance de loyer non annulée (une caution seule n'est pas un échéancier, TCK-957) ;
 *   sinon `up_to_date`. Sans bail du tout : `null`.
 * - Les `items[]` portent des codes et des données, jamais un libellé : le front possède le texte.
 *
 * Un même compte a une fiche client par agence : toutes sont lues, comme le tableau de bord
 * (`DashboardTenantService`).
 */
final class TenantRentSummary
{
    public function __construct(private readonly PaymentGatewayService $gateway) {}

    /** @return array<string, mixed> */
    public function for(User $user): array
    {
        $customerIds = Customer::query()->where('user_id', $user->id)->pluck('id')->all();
        $today = OverdueInstalment::today();

        $leases = $customerIds === [] ? collect() : Lease::query()
            ->whereIn('tenant_id', $customerIds)
            ->with(['agency', 'property:id,title'])
            ->orderByDesc('start_date')
            ->orderByDesc('id')
            ->get();
        $ongoing = $leases->filter(fn (Lease $l) => in_array($l->status?->value, Lease::ONGOING_STATUSES, true))->values();

        $dues = $this->owedDues($customerIds, $today);
        $fees = $this->outstandingFees($customerIds);

        $items = [];
        $total = 0.0;
        $online = 0.0;
        foreach ($dues as $due) {
            $isOnline = $this->payableOnline($due);
            $remaining = (float) $due->remaining_amount;
            $total += $remaining;
            if ($isOnline) {
                // `amountDue` = le reste dû, plus la pénalité quand l'agence l'encaisse en ligne.
                $online += (float) $this->gateway->amountDue($due);
            }
            $items[] = $this->item($due, $due->payment_type->value, $remaining, $isOnline);
        }
        foreach ($fees as $due) {
            $fee = $due->lateFeeOutstanding();
            $total += $fee;
            $items[] = $this->item($due, 'late_fee', $fee, $this->payableOnline($due) && $this->gateway->lateFeeIncluded($due));
        }

        $total = round($total, 2);
        $online = round(min($online, $total), 2);
        $lease = $ongoing->first() ?? $leases->first();

        return [
            'currency' => $lease?->currency?->value ?? $dues->first()?->currency?->value,
            'total_due' => $total,
            'parts' => [
                'payable_online' => $online,
                'payable_at_agency' => round($total - $online, 2),
            ],
            'items' => $items,
            'next_rent' => $this->nextRent($customerIds, $today),
            'schedule_state' => $this->scheduleState($leases, $ongoing, $total),
            'lease' => $lease === null ? null : [
                'id' => $lease->id,
                'reference_number' => $lease->reference_number,
                'status' => $lease->status?->value,
                'monthly_rent' => $lease->monthly_rent !== null ? (float) $lease->monthly_rent : null,
                'monthly_charges' => $lease->monthly_charges !== null ? (float) $lease->monthly_charges : null,
                'currency' => $lease->currency?->value,
                'property' => $lease->property ? ['id' => $lease->property->id, 'title' => $lease->property->title] : null,
                'agency' => $lease->agency ? [
                    'id' => $lease->agency->id,
                    'name' => $lease->agency->name,
                    'phone' => $lease->agency->phone,
                ] : null,
            ],
            'offline_payment' => OfflinePaymentMeans::of($lease?->agency),
        ];
    }

    /**
     * Les échéances périodiques dues, échues ou dues aujourd'hui, avec un reste.
     *
     * @param  list<int>  $customerIds
     * @return Collection<int, LeasePayment>
     */
    private function owedDues(array $customerIds, string $today): Collection
    {
        if ($customerIds === []) {
            return collect();
        }

        return $this->ofTenant(CollectedPayments::leaseOwed(), $customerIds)
            ->whereIn('lease_payments.payment_type', LeaseService::SCHEDULED_PERIOD_TYPES)
            ->whereDate('lease_payments.due_date', '<=', $today)
            ->orderBy('lease_payments.due_date')
            ->orderBy('lease_payments.id')
            ->get()
            ->filter(fn (LeasePayment $p) => (float) $p->remaining_amount > 0)
            ->values();
    }

    /**
     * Les pénalités restant dues, sur toute échéance du locataire, payée ou non.
     *
     * @param  list<int>  $customerIds
     * @return Collection<int, LeasePayment>
     */
    private function outstandingFees(array $customerIds): Collection
    {
        if ($customerIds === []) {
            return collect();
        }

        return $this->ofTenant(CollectedPayments::lateFeesOutstanding(), $customerIds)
            ->orderBy('lease_payments.due_date')
            ->orderBy('lease_payments.id')
            ->get()
            ->filter(fn (LeasePayment $p) => $p->lateFeeOutstanding() > 0)
            ->values();
    }

    /**
     * Les échéances des baux du locataire (bail non supprimé), relations de la passerelle chargées.
     *
     * @param  Builder<LeasePayment>  $query
     * @param  list<int>  $customerIds
     * @return Builder<LeasePayment>
     */
    private function ofTenant($query, array $customerIds)
    {
        return $query
            ->select('lease_payments.*')
            ->whereHas('lease', fn ($q) => $q->whereIn('tenant_id', $customerIds))
            ->with(['lease.agency']);
    }

    /** La porte du paiement en ligne, celle du lien de paiement : payable, et un fournisseur actif. */
    private function payableOnline(LeasePayment $due): bool
    {
        return $this->gateway->isPayable($due) && $this->gateway->availableProviders($due) !== [];
    }

    /** @return array<string, mixed> */
    private function item(LeasePayment $due, string $kind, float $amount, bool $online): array
    {
        return [
            'kind' => $kind,
            'lease_payment_id' => $due->id,
            'lease_id' => $due->lease_id,
            'payment_type' => $due->payment_type?->value,
            'due_date' => $due->due_date?->toDateString(),
            'period_start' => $due->period_start?->toDateString(),
            'period_end' => $due->period_end?->toDateString(),
            'amount' => round($amount, 2),
            'currency' => $due->currency?->value,
            'days_late' => OverdueInstalment::daysLate($due),
            'payable_online' => $online,
        ];
    }

    /**
     * Le prochain loyer pas encore échu : sa date, son reste (`amount`) et les charges appelées le
     * même jour sur le même bail (`charges_amount`, TCK-2679), à part — le paiement en ligne d'une
     * échéance ne règle que celle-là.
     *
     * @param  list<int>  $customerIds
     * @return array<string, mixed>|null
     */
    private function nextRent(array $customerIds, string $today): ?array
    {
        if ($customerIds === []) {
            return null;
        }

        $rent = $this->ofTenant(CollectedPayments::leaseOwed(), $customerIds)
            ->where('lease_payments.payment_type', LeasePaymentType::Rent->value)
            ->whereDate('lease_payments.due_date', '>', $today)
            ->orderBy('lease_payments.due_date')
            ->orderBy('lease_payments.id')
            ->first();
        if ($rent === null) {
            return null;
        }

        $charges = LeasePayment::query()
            ->where('lease_id', $rent->lease_id)
            ->where('payment_type', LeasePaymentType::Charges->value)
            ->whereIn('status', CollectedPayments::owedStatusValues())
            ->whereDate('due_date', $rent->due_date->toDateString())
            ->get()
            ->sum(fn (LeasePayment $p) => (float) $p->remaining_amount);

        return [
            'lease_id' => $rent->lease_id,
            'lease_payment_id' => $rent->id,
            'due_date' => $rent->due_date->toDateString(),
            'amount' => (float) $rent->remaining_amount,
            'charges_amount' => round((float) $charges, 2),
            'currency' => $rent->currency?->value,
            'payable_online' => $this->payableOnline($rent),
        ];
    }

    /**
     * @param  Collection<int, Lease>  $leases
     * @param  Collection<int, Lease>  $ongoing
     */
    private function scheduleState(Collection $leases, Collection $ongoing, float $total): ?string
    {
        if ($total > 0) {
            return 'due';
        }
        if ($leases->isEmpty()) {
            return null;
        }

        $withoutSchedule = $ongoing->contains(fn (Lease $lease) => ! $lease->payments()
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->where('status', '!=', PaymentStatus::Cancelled->value)
            ->exists());

        return $withoutSchedule ? 'none' : 'up_to_date';
    }
}
