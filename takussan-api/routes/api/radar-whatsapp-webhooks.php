<?php

use App\Http\Controllers\Webhook\RadarWhatsappWebhookController;
use Illuminate\Support\Facades\Route;

/**
 * TCK-2395 (ADR-0077 §5) — le webhook du numéro WhatsApp du Radar, distinct de celui des notifications
 * (`whatsapp-webhooks.php`) : ses propres jeton d'URL, secret d'application et jeton de vérification
 * (`config/radar_whatsapp.php`), son propre seau de débit, et le journal des webhooks avant tout traitement.
 */
Route::prefix('webhooks/whatsapp/radar')->group(function (): void {
    Route::post('{token}', RadarWhatsappWebhookController::class)
        ->middleware(['throttle:webhook-whatsapp-radar', 'webhook.journal:whatsapp,whatsapp_cloud_radar'])
        ->name('whatsapp.webhook.radar');

    // La vérification d'abonnement de Meta, sur le même chemin, hors du journal : elle porte le jeton de vérification.
    Route::get('{token}', [RadarWhatsappWebhookController::class, 'verify'])
        ->middleware('throttle:webhook-whatsapp-radar')
        ->name('whatsapp.webhook.radar.verify');
});
