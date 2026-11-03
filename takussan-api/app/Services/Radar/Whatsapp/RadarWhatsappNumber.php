<?php

namespace App\Services\Radar\Whatsapp;

use App\Models\Integration;

/**
 * TCK-2395 (ADR-0077 §5, ADR-0081) — le numéro dédié au Radar : sa configuration (`config/radar_whatsapp.php`, et nulle
 * part ailleurs) et LA garde qui l'empêche d'être celui des notifications. Avant tout envoi par l'API :
 *
 * - 422 `radar.whatsapp.not_configured` sans identifiant de numéro ou sans jeton : jamais de repli vers un autre numéro ;
 * - 422 `radar.whatsapp.not_configured` aussi pour le pilote `log` hors `local` et `testing` : il « réussirait » l'envoi
 *   sans rien envoyer, et le message marqué envoyé ne pourrait plus partir ;
 * - 422 `radar.whatsapp.same_number` quand l'identifiant de numéro OU le jeton est celui d'une intégration WhatsApp des
 *   notifications, active ou non, supprimée comprise : un même jeton désigne la même application Meta, donc le même
 *   compte, qu'une restriction pour « spam » frappe en entier.
 */
final class RadarWhatsappNumber
{
    /** Les environnements où le pilote `log` (qui n'envoie rien) peut tenir lieu d'envoi. */
    private const LOG_ENVIRONMENTS = ['local', 'testing'];

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
        return trim((string) config('radar_whatsapp.access_token', ''));
    }

    public function assertUsable(): void
    {
        if ($this->driver() !== 'cloud') {
            abort_code_unless(app()->environment(self::LOG_ENVIRONMENTS), 422, 'radar.whatsapp.not_configured');

            return;
        }
        abort_code_if($this->phoneNumberId() === '' || $this->accessToken() === '', 422, 'radar.whatsapp.not_configured');
        foreach ($this->notificationCredentials() as [$numberId, $token]) {
            abort_code_if($numberId === $this->phoneNumberId() || ($token !== '' && hash_equals($token, $this->accessToken())), 422, 'radar.whatsapp.same_number');
        }
    }

    /**
     * L'envoi par l'API est-il possible ici (ce que lit le front pour offrir le bouton, TCK-2426) : la configuration
     * seule, sans lire la base. La garde du numéro des notifications se juge à l'envoi ({@see self::assertUsable()}).
     */
    public function available(): bool
    {
        return $this->driver() === 'cloud'
            ? $this->phoneNumberId() !== '' && $this->accessToken() !== ''
            : app()->environment(self::LOG_ENVIRONMENTS);
    }

    /**
     * L'identifiant de numéro et le jeton des intégrations WhatsApp des notifications, actives ou non, supprimées
     * comprises, de toute agence. Lus pour être REFUSÉS, jamais pour envoyer.
     *
     * @return list<array{0: string, 1: string}>
     */
    public function notificationCredentials(): array
    {
        return Integration::query()
            ->withTrashed()
            ->where('provider', (string) config('whatsapp.integration_provider', 'whatsapp_cloud'))
            ->get()
            ->map(function (Integration $integration): array {
                $credentials = (array) ($integration->credentials ?? []);

                return [trim((string) ($credentials['phone_number_id'] ?? '')), trim((string) ($credentials['access_token'] ?? ''))];
            })
            ->values()
            ->all();
    }
}
