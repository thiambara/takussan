<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\Integration;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * TCK-733 (P04.05) — un payable soldé en ligne, tel que `PaymentGatewayService` le laisse : le
 * checkout noté dans `metadata.gateway.transactions` avec l'intégration qui l'a initié, et
 * `settled_by` posé par le webhook. Seul un payable soldé par une intégration GLOBALE
 * (`agency_id` nul) entre dans la clôture plateforme.
 */
trait EncaissementsPlateforme
{
    /** Soldé par l'intégration de la plateforme. */
    protected function soldeParLaPlateforme(Model $payment, float $lateFee = 0.0): Model
    {
        return $this->soldePar($payment, $this->integration(null), $lateFee);
    }

    /** Soldé par l'intégration propre à une agence : l'argent est chez elle. */
    protected function soldeParLAgence(Model $payment, Agency $agency): Model
    {
        return $this->soldePar($payment, $this->integration($agency));
    }

    protected function soldePar(Model $payment, Integration $integration, float $lateFee = 0.0): Model
    {
        $transactionId = 'tx_'.Str::random(12);
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $meta['gateway'] = [
            'provider' => $integration->provider,
            'transaction_id' => $transactionId,
            'integration_id' => $integration->id,
            'settled_by' => $transactionId,
            'transactions' => [[
                'transaction_id' => $transactionId,
                'provider' => $integration->provider,
                'integration_id' => $integration->id,
                'amount' => (float) $payment->amount + $lateFee,
                'late_fee_included' => $lateFee > 0,
                'late_fee_amount' => $lateFee,
            ]],
        ];

        $payment->forceFill(['transaction_id' => $transactionId, 'metadata' => $meta])->save();

        return $payment;
    }

    private function integration(?Agency $agency): Integration
    {
        // Une intégration vivante par (fournisseur, agence) : `integrations_provider_agency_live_unique`.
        return Integration::query()->where('provider', 'wave')->where('agency_id', $agency?->id)->first()
            ?? Integration::factory()->create([
                'provider' => 'wave',
                'agency_id' => $agency?->id,
                'credentials' => ['api_key' => 'k', 'webhook_secret' => 's'],
            ]);
    }
}
