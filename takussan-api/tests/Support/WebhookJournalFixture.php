<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\Integration;
use Illuminate\Testing\TestResponse;

/**
 * TCK-602 — un webhook Wave signé, envoyé OCTET POUR OCTET sur l'URL d'une intégration (ADR-0046) :
 * le journal garde le corps tel que reçu, et le rejeu en revérifie la signature.
 */
trait WebhookJournalFixture
{
    protected string $journalWaveSecret = 'wave_secret_602';

    protected function journalWaveIntegration(?Agency $agency, array $attributes = []): Integration
    {
        return Integration::factory()->create($attributes + [
            'agency_id' => $agency?->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => $this->journalWaveSecret],
        ]);
    }

    protected function waveBody(string $transactionId, string $type = 'checkout.session.completed', array $extra = []): string
    {
        return json_encode(['type' => $type, 'data' => ['id' => $transactionId]] + $extra);
    }

    protected function postWave(Integration $integration, string $body, ?string $secret = null): TestResponse
    {
        $ts = time();
        $signature = "t={$ts},v1=".hash_hmac('sha256', $ts.'.'.$body, $secret ?? $this->journalWaveSecret);

        return $this->call('POST', '/api/webhooks/payments/wave/'.$integration->webhook_token, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => $signature,
        ], $body);
    }
}
