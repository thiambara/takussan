<?php

namespace App\Services\Radar\Whatsapp;

use App\Models\Integration;

/**
 * TCK-2395 (ADR-0077 §5) — le numéro dédié au Radar : sa configuration (`config/radar_whatsapp.php`, et nulle part
 * ailleurs) et LA garde qui l'empêche d'être celui des notifications. Avant tout envoi par le pilote `cloud` :
 *
 * - 422 `radar.whatsapp.not_configured` sans identifiant de numéro ou sans jeton : jamais de repli vers un autre numéro ;
 * - 422 `radar.whatsapp.same_number` quand l'identifiant est celui d'une intégration WhatsApp des notifications, active
 *   ou non : une erreur de saisie ne fait pas prospecter par le numéro des baux.
 *
 * Le pilote `log` n'envoie rien : il n'y a rien à garder.
 */
final class RadarWhatsappNumber
{
    public function driver(): string
    {
        return (string) config('radar_whatsapp.driver', 'log');
    }

    public function phoneNumberId(): string
    {
        return trim((string) config('radar_whatsapp.phone_number_id', ''));
    }

    public function accessToken(): string
    {
        return (string) config('radar_whatsapp.access_token', '');
    }

    public function assertUsable(): void
    {
        if ($this->driver() !== 'cloud') {
            return;
        }
        abort_code_if($this->phoneNumberId() === '' || $this->accessToken() === '', 422, 'radar.whatsapp.not_configured');
        abort_code_if(in_array($this->phoneNumberId(), $this->notificationNumbers(), true), 422, 'radar.whatsapp.same_number');
    }

    /**
     * Les identifiants de numéro des intégrations WhatsApp des notifications, actives ou non, de toute agence. Lus pour
     * être REFUSÉS, jamais pour envoyer.
     *
     * @return list<string>
     */
    public function notificationNumbers(): array
    {
        return Integration::query()
            ->where('provider', (string) config('whatsapp.integration_provider', 'whatsapp_cloud'))
            ->get()
            ->map(fn (Integration $integration): string => trim((string) (($integration->credentials ?? [])['phone_number_id'] ?? '')))
            ->filter(fn (string $id): bool => $id !== '')
            ->values()
            ->all();
    }
}
