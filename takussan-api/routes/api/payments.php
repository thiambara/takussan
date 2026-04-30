<?php

use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentGatewayController;
use App\Http\Controllers\Api\Webhooks\PaymentWebhookController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    // Unified payment router — creates BookingPayment or LeasePayment
    // depending on payable_type ('booking' | 'lease').
    Route::post('payments', [PaymentController::class, 'store'])->name('payments.store');

    // Consolidated history across BookingPayment + LeasePayment with
    // entity_type / entity_id / status / date filters.
    Route::get('payments/history', [PaymentController::class, 'history'])->name('payments.history');

    // TCK-079 — payment gateway. Polymorphic on the underlying payment
    // table (`booking-payments` | `lease-payments` | `invoices`) so the
    // service can resolve the right model + agency scope.
    Route::post('{paymentType}/{paymentId}/initiate', [PaymentGatewayController::class, 'initiate'])
        ->where(['paymentType' => 'booking-payments|lease-payments|invoices', 'paymentId' => '\d+'])
        ->name('payments.gateway.initiate');

    Route::get('{paymentType}/{paymentId}/verify', [PaymentGatewayController::class, 'verify'])
        ->where(['paymentType' => 'booking-payments|lease-payments|invoices', 'paymentId' => '\d+'])
        ->name('payments.gateway.verify');
});

// TCK-079 — public webhook receiver. Throttled to 60 requests / minute / IP
// to mitigate replay floods. Signature verification is performed inside
// each driver's `handleWebhook()` (Wave / OM via HMAC-SHA256, LS via the
// vendor package on its dedicated route).
Route::post('webhooks/payments/{provider}', PaymentWebhookController::class)
    ->middleware('throttle:60,1')
    ->name('payments.webhook');
