<?php

use App\Http\Controllers\Webhook\LAfricaMobileSmsStatusController;
use App\Http\Controllers\Webhook\MtargetSmsStatusController;
use App\Http\Controllers\Webhook\OrangeSmsStatusController;
use Illuminate\Support\Facades\Route;

/**
 * TCK-102 — Inbound SMS DLR webhooks.
 *
 * Each provider has a distinct route guarded by an IP allowlist
 * middleware (`restrict.ip:{provider}`) and a per-IP throttle to slow
 * brute-force attempts at the URL token. The `{token}` segment is a
 * server-side secret rotated on credential compromise; the Mtarget
 * provider configures its callback URL once at the account level so
 * its endpoint is fixed per env. LAM additionally relies on Laravel's
 * `signed` route guard since the URL is generated per-message.
 *
 * TCK-602 (ADR-0051 §4) — `webhook.journal` vient juste après le débit et AVANT `restrict.ip` : un
 * accusé refusé par l'allowlist laisse sa ligne `rejected`. Le `{token}` n'est jamais journalisé.
 */
Route::prefix('webhooks/sms')->group(function (): void {
    Route::post('orange/status/{token}', OrangeSmsStatusController::class)
        ->middleware(['throttle:120,1', 'webhook.journal:sms,orange', 'restrict.ip:orange'])
        ->name('sms.webhook.orange');

    Route::post('mtarget/status/{token}', MtargetSmsStatusController::class)
        ->middleware(['throttle:120,1', 'webhook.journal:sms,mtarget', 'restrict.ip:mtarget'])
        ->name('sms.webhook.mtarget');

    Route::get('lafricamobile/status/{token}/{notification}', LAfricaMobileSmsStatusController::class)
        ->middleware(['throttle:120,1', 'webhook.journal:sms,lafricamobile', 'restrict.ip:lafricamobile', 'signed'])
        ->name('sms.webhook.lafricamobile');
});
