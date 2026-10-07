<?php

namespace App\Services\Lease;

use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Support\Facades\DB;

/**
 * TCK-593 — l'agence enregistre une pénalité de retard réglée chez elle.
 *
 * Pose `late_fee_paid_at` et rien d'autre : `status` décrit le LOYER et ne bouge pas (`paid` si le
 * loyer l'est, sinon il reste `late`). La remise — l'abandon d'une pénalité — n'est pas ce geste et
 * n'est pas livrée ici.
 */
class LateFeeSettlement
{
    /**
     * @param  array{paid_at?: ?string, payment_method?: ?string}  $data
     */
    public function markPaid(LeasePayment $payment, User $by, array $data = []): LeasePayment
    {
        return DB::transaction(function () use ($payment, $by, $data): LeasePayment {
            // Sérialisé sur la ligne : deux enregistrements simultanés ne posent pas deux règlements.
            $locked = LeasePayment::query()->whereKey($payment->getKey())->lockForUpdate()->firstOrFail();

            abort_unless($locked->lateFeeOutstanding() > 0, 409, __('payments.late_fee_not_due'));

            // TCK-593 (vérification adverse, V4) — un checkout ouvert qui INCLUT la pénalité
            // l'encaissera : l'enregistrer réglée à l'agence en même temps la ferait payer deux fois.
            $gateway = app(PaymentGatewayService::class);
            abort_if(
                $gateway->openCheckout($locked) !== null && ($locked->metadata['late_fee_included'] ?? false) === true,
                409,
                __('payments.checkout_in_progress'),
            );

            $metadata = is_array($locked->metadata) ? $locked->metadata : [];
            if (! empty($data['payment_method'])) {
                // Le moyen de règlement de la PÉNALITÉ : `payment_method` décrit celui du loyer.
                $metadata['late_fee_payment_method'] = $data['payment_method'];
            }

            $locked->forceFill([
                'late_fee_paid_at' => $data['paid_at'] ?? now(),
                'metadata' => $metadata,
            ])->save();

            activity('LeasePayment')
                ->causedBy($by)
                ->performedOn($locked)
                ->withProperties(['late_fee_amount' => (float) $locked->late_fee_amount])
                ->event('late_fee_paid')
                ->log('late_fee_paid');

            return $locked;
        });
    }
}
