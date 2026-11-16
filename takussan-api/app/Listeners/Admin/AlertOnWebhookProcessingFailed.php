<?php

namespace App\Listeners\Admin;

use App\Events\Webhooks\WebhookProcessingFailed;

/**
 * TCK-606 — un webhook authentifié dont le traitement a échoué (ligne du journal fermée sur
 * `failed`) écrit l'activité alertable `webhook_processing_failed` : les règles d'alerte de la
 * console la prennent par la même voie que les autres événements (`DispatchAlerts`, sur `Activity`).
 *
 * La charge ne porte que les champs de l'événement — jamais le corps ni un en-tête du webhook :
 * de quoi rouvrir la ligne du journal, rien de ce que le fournisseur a envoyé.
 *
 * Découvert automatiquement (`app/Listeners`) : aucun `listen()` à ajouter.
 */
class AlertOnWebhookProcessingFailed
{
    public function handle(WebhookProcessingFailed $event): void
    {
        activity('Webhooks')
            ->event('webhook_processing_failed')
            ->withProperties([
                'webhook_log_id' => $event->webhookLogId,
                'channel' => $event->channel,
                'provider' => $event->provider,
                'agency_id' => $event->agencyId,
                'error_code' => $event->errorCode,
            ])
            ->log('webhook_processing_failed');
    }
}
