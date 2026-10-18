<?php

namespace Tests\Feature\Http\Webhook;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * P36.05 (TCK-944) — la vérification d'abonnement de Meta : pour enregistrer l'URL de rappel,
 * Meta appelle en `GET` le chemin du webhook avec `hub.mode=subscribe`, `hub.verify_token` et
 * `hub.challenge`, et attend le défi en retour. Sans cette route, l'URL ne s'enregistre pas et
 * aucun statut WhatsApp n'arrive.
 *
 * La requête est construite avec les points de Meta (`hub.mode`) : PHP les reçoit en `hub_mode`,
 * en test comme en production.
 */
class WhatsappSubscriptionVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('whatsapp.webhook_url_token', 'tck-944-url');
        config()->set('whatsapp.webhook_verify_token', 'tck-944-verify');
    }

    private function verify(string $mode = 'subscribe', string $verifyToken = 'tck-944-verify', string $urlToken = 'tck-944-url'): TestResponse
    {
        return $this->get("/api/webhooks/whatsapp/status/{$urlToken}?hub.mode={$mode}&hub.verify_token={$verifyToken}&hub.challenge=1158201444");
    }

    public function test_the_right_verify_token_echoes_the_challenge_as_plain_text(): void
    {
        $response = $this->verify()->assertOk();

        $this->assertSame('1158201444', $response->getContent());
        $this->assertStringStartsWith('text/plain', (string) $response->headers->get('Content-Type'));
    }

    public function test_a_wrong_verify_token_is_forbidden(): void
    {
        $response = $this->verify(verifyToken: 'mauvais')->assertForbidden();

        $this->assertStringNotContainsString('1158201444', (string) $response->getContent());
    }

    public function test_a_mode_other_than_subscribe_is_forbidden(): void
    {
        $this->verify(mode: 'unsubscribe')->assertForbidden();
    }

    public function test_a_missing_mode_is_forbidden(): void
    {
        $response = $this->get('/api/webhooks/whatsapp/status/tck-944-url?hub.verify_token=tck-944-verify&hub.challenge=1158201444')
            ->assertForbidden();

        $this->assertStringNotContainsString('1158201444', (string) $response->getContent());
    }

    public function test_an_unconfigured_verify_token_refuses_even_an_empty_one(): void
    {
        config()->set('whatsapp.webhook_verify_token', '');

        $this->verify(verifyToken: '')->assertForbidden();
    }

    public function test_the_url_token_still_guards_the_path(): void
    {
        $this->verify(urlToken: 'mauvais')->assertNotFound();
    }
}
