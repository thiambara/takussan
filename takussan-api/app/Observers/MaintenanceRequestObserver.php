<?php

namespace App\Observers;

use App\Models\Enums\Currency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\MaintenanceRequest;
use App\Models\ServiceProviderBill;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;
use Illuminate\Support\Str;

/**
 * TCK-594 (ADR-0039 §8) — une intervention terminée par un prestataire produit sa facture.
 *
 * Au passage à `completed`, avec un prestataire assigné et un montant > 0 — le coût réel s'il est
 * fourni, sinon le devis APPROUVÉ (décidé, sans motif de rejet) —, une facture
 * `pending_validation`. Sans exception attendue (piège PostgreSQL n° 1) : `insertOrIgnore` contre
 * l'index unique partiel `sp_bills_one_open_per_request`, si bien qu'un second passage par
 * `completed` n'en crée pas de seconde. Après le commit : une transaction annulée ne facture rien.
 */
class MaintenanceRequestObserver implements ShouldHandleEventsAfterCommit
{
    public function updated(MaintenanceRequest $request): void
    {
        if (! $request->wasChanged('status') || $request->status !== MaintenanceStatus::Completed) {
            return;
        }

        $this->bill($request);
    }

    public function created(MaintenanceRequest $request): void
    {
        if ($request->status === MaintenanceStatus::Completed) {
            $this->bill($request);
        }
    }

    private function bill(MaintenanceRequest $request): void
    {
        if ($request->assigned_to === null) {
            return;
        }

        $quote = $request->quote_decision_at !== null && $request->quote_rejection_reason === null
            ? (float) ($request->quote_amount ?? 0)
            : 0.0;
        $actual = (float) ($request->actual_cost ?? 0);
        $amount = $actual > 0 ? $actual : $quote;
        if ($amount <= 0) {
            return;
        }

        $property = $request->property()->first(['id', 'agency_id']);
        $now = now();
        $currency = $request->quote_currency ?? 'XOF';

        ServiceProviderBill::query()->insertOrIgnore([
            'maintenance_request_id' => $request->id,
            'agency_id' => $property?->agency_id,
            'property_id' => $property?->id,
            'provider_id' => $request->assigned_to,
            'reference_number' => 'SPB-'.$now->format('Ym').'-'.strtoupper(Str::random(8)),
            // VERIF-594 m-3 — à l'unité de la devise, comme `PayoutCalculator::round` : 60 000,6 XOF
            // payés au prestataire et 60 001 débités au bailleur divergeaient.
            'amount' => round($amount, Currency::decimalPlacesOf($currency), PHP_ROUND_HALF_UP),
            'currency' => $currency,
            'exceeds_quote' => $quote > 0 && $actual > $quote,
            'status' => ServiceProviderBillStatus::PendingValidation->value,
            'rechargeable_to_landlord' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}
