<?php

namespace App\Events\Webhooks;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * TCK-602 (ADR-0051 §4) — une ligne du journal vient de se fermer sur `failed` : le webhook était
 * authentifié et son traitement a échoué côté serveur (5xx). Émis par `WebhookJournal::close`, sur
 * le chemin réel comme au rejeu.
 *
 * ⚠ AUCUN écouteur, délibérément : les règles d'alerte appartiennent à TCK-600
 * (`AlertableEvents`), qui l'y abonnera. L'événement ne porte ni corps ni en-tête — seulement de
 * quoi rouvrir la ligne.
 */
class WebhookProcessingFailed implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly int $webhookLogId,
        public readonly string $channel,
        public readonly string $provider,
        public readonly ?int $agencyId,
        public readonly ?string $errorCode,
    ) {}
}
