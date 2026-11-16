<?php

use App\Http\Controllers\Api\LeasePaymentLinkController;
use App\Http\Controllers\Api\LeasePaymentReminderController;
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
 *
 * TCK-606 (verif-602 m4) — `initiate` et `verify` sont bornés par IP ET par jeton (limiteurs nommés
 * `pay-link-initiate` / `pay-link-verify`, empreinte du jeton) : un lien qui fuit ne se martèle plus
 * depuis N IP.
 */
Route::prefix('pay/{token}')
    ->where(['token' => LeasePaymentLinkService::TOKEN_PATTERN])
    ->group(function (): void {
        Route::get('/', [PublicPaymentLinkController::class, 'show'])
            ->middleware('throttle:30,1,pay_link_show')
            ->name('pay.show');
        Route::post('initiate', [PublicPaymentLinkController::class, 'initiate'])
            ->middleware('throttle:pay-link-initiate')
            ->name('pay.initiate');
        Route::post('verify', [PublicPaymentLinkController::class, 'verify'])
            ->middleware('throttle:pay-link-verify')
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
    // TCK-2658 (ADR-0105) — la relance NOTÉE d'un impayé : l'agence a relancé depuis son téléphone,
    // l'API garde le fait et n'envoie rien. La lecture fusionne relances notées et rappels automatiques.
    Route::get('lease-payments/{payment}/reminders', [LeasePaymentReminderController::class, 'index'])
        ->name('lease-payments.reminders.index');
    Route::post('lease-payments/{payment}/reminders', [LeasePaymentReminderController::class, 'store'])
        ->name('lease-payments.reminders.store');
});
