<?php

use App\Http\Controllers\Webhook\WhatsappStatusController;
use Illuminate\Support\Facades\Route;

/**
 * TCK-283 — Inbound WhatsApp Cloud (Meta) delivery-status webhook.
 *
 * Auth is the `{token}` URL secret + the `X-Hub-Signature-256` HMAC keyed
 * by the Meta app secret (verified in the controller). A per-IP throttle
 * slows brute-force attempts at the token. Unlike the SMS webhooks, no IP
 * allowlist is applied: Meta's egress IPs are broad and not stably
 * allowlistable, so the signature is the primary control.
 */
Route::prefix('webhooks/whatsapp')->group(function (): void {
    Route::post('status/{token}', WhatsappStatusController::class)
        ->middleware('throttle:120,1')
        ->name('whatsapp.webhook.status');
});
