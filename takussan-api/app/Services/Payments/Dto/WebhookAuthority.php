<?php

namespace App\Services\Payments\Dto;

use App\Models\Integration;

/**
 * TCK-293 (ADR-0046 §5) — QUI a authentifié un événement de paiement, et donc ce qu'il peut
 * rapprocher.
 *
 * - `of($integration)` : l'intégration dont le jeton a résolu l'URL et dont le secret a validé la
 *   signature. Son agence borne le rapprochement ; `agency_id` nul = la plateforme.
 * - `platform($integration)` : la plateforme, quand c'est un secret de CONFIGURATION qui a validé
 *   (chemin du paquet Lemon Squeezy). `$integration` est alors l'intégration de la plateforme, s'il
 *   y en a une.
 *
 * TCK-602 lit `integration` (et `agencyId`) pour rattacher son journal de webhooks.
 */
final class WebhookAuthority
{
    private function __construct(
        public readonly ?Integration $integration,
        public readonly ?int $agencyId,
    ) {}

    public static function of(Integration $integration): self
    {
        return new self($integration, $integration->agency_id !== null ? (int) $integration->agency_id : null);
    }

    public static function platform(?Integration $integration = null): self
    {
        return new self($integration !== null && $integration->agency_id === null ? $integration : null, null);
    }

    public function isPlatform(): bool
    {
        return $this->agencyId === null;
    }
}
