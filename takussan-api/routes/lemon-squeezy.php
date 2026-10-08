<?php

use Illuminate\Support\Facades\Route;
use LemonSqueezy\Laravel\Http\Controllers\WebhookController;

/**
 * TCK-602 (ADR-0051 §4) — la route du paquet `lemonsqueezy/laravel`, reprise à l'URL et au nom
 * IDENTIQUES (`/{lemon-squeezy.path}/webhook`, `lemon-squeezy.webhook`, hors préfixe `/api`) : le
 * tableau de bord Lemon Squeezy n'a rien à changer. Le paquet la montait sans débit ni trace
 * (`LemonSqueezy::ignoreRoutes()`, dans `AppServiceProvider::register()`) ; elle passe désormais par
 * `throttle:60,1` puis le journal des webhooks, AVANT le middleware de signature du contrôleur du
 * paquet — un `X-Signature` faux laisse donc sa ligne `rejected`.
 *
 * `authenticated_at` est posé par `App\Listeners\Payments\MarkLemonSqueezyWebhookAuthenticated`,
 * à l'événement `WebhookReceived` que le paquet n'émet qu'après la signature.
 */
Route::prefix((string) config('lemon-squeezy.path'))
    ->as('lemon-squeezy.')
    ->middleware(['throttle:60,1', 'webhook.journal:payment,lemon_squeezy'])
    ->group(function (): void {
        Route::post('webhook', WebhookController::class)->name('webhook');
    });
