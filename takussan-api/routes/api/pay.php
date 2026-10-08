<?php

use App\Http\Controllers\Api\LeasePaymentLinkController;
use App\Http\Controllers\Api\PublicPaymentLinkController;
use App\Services\Payments\LeasePaymentLinkService;
use Illuminate\Support\Facades\Route;

/*
 * TCK-602 (ADR-0051 §1) — le lien de paiement d'une échéance.
 *
 * Public, SANS `auth` : le jeton du lien est l'autorisation, et il ne donne que ceci — lire le
 * montant de SON échéance, la payer, relire sa quittance. Débit par IP, chaque route sous son
 * propre compteur (le préfixe : sans lui, toutes les routes `throttle:N,1` d'une IP partagent un
 * compte).
 */
Route::prefix('pay/{token}')
    ->where(['token' => LeasePaymentLinkService::TOKEN_PATTERN])
    ->group(function (): void {
        Route::get('/', [PublicPaymentLinkController::class, 'show'])
            ->middleware('throttle:30,1,pay_link_show')
            ->name('pay.show');
        Route::post('initiate', [PublicPaymentLinkController::class, 'initiate'])
            ->middleware('throttle:10,1,pay_link_initiate')
            ->name('pay.initiate');
        Route::post('verify', [PublicPaymentLinkController::class, 'verify'])
            ->middleware('throttle:6,1,pay_link_verify')
            ->name('pay.verify');
        Route::get('receipt', [PublicPaymentLinkController::class, 'receipt'])
            ->middleware('throttle:10,1,pay_link_receipt')
            ->name('pay.receipt');
    });

// Qui relance : émettre (ou relire l'actif), régénérer, révoquer.
Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('lease-payments/{payment}/payment-link', [LeasePaymentLinkController::class, 'store'])
        ->name('lease-payments.payment-link.store');
    Route::delete('lease-payments/{payment}/payment-link', [LeasePaymentLinkController::class, 'destroy'])
        ->name('lease-payments.payment-link.destroy');
});
