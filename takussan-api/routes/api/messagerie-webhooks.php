<?php

use App\Http\Controllers\Webhook\MessagerieWebhookController;
use Illuminate\Support\Facades\Route;

/**
 * TCK-2980 (ADR-0132 § 0) — le webhook de la messagerie, UN PAR CANAL, sur le patron de
 * `webhooks/payments/{provider}/{token}` : le registre résout `{canal}` (inconnu, inactif ou sans « reçoit » : 404),
 * le jeton d'URL du canal garde (404), le pilote vérifie la signature (403), puis le pont. Aucune contrainte de forme
 * sur `{canal}` ni `{token}` : une valeur mal formée rend le même 404 qu'une valeur inconnue, pas celui du routeur.
 *
 * Le journal des webhooks s'ouvre après le débit (`webhook.journal:messagerie`, fournisseur = le canal) ; la
 * vérification d'abonnement (`GET`) est hors du journal, comme celle de WhatsApp (sa requête porte le jeton de
 * vérification). L'alias `webhooks/whatsapp/status/{token}` vit dans `whatsapp-webhooks.php`.
 */
Route::prefix('webhooks/messagerie')->group(function (): void {
    Route::post('{canal}/{token}', MessagerieWebhookController::class)
        ->middleware(['throttle:webhook-messagerie', 'webhook.journal:messagerie'])
        ->name('messagerie.webhook');

    Route::get('{canal}/{token}', [MessagerieWebhookController::class, 'verify'])
        ->middleware('throttle:webhook-messagerie')
        ->name('messagerie.webhook.verify');
});
