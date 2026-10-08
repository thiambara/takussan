<?php

namespace Tests\Feature\Webhooks;

use App\Models\Agency;
use App\Models\IntegrationWebhookLog;
use App\Services\Webhooks\WebhookPayloadRedactor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\WebhookJournalFixture;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §4, AC6) — ce que la console lit d'un webhook est une vue EXPURGÉE : ni numéro
 * entier, ni e-mail, ni nom. Le corps gardé pour le rejeu est chiffré : une lecture SQL brute n'y
 * trouve pas le numéro.
 */
class WebhookPayloadRedactionTest extends TestCase
{
    use RefreshDatabase, WebhookJournalFixture;

    private const PHONE = '221771234567';

    private const EMAIL = 'awa.ndiaye@example.sn';

    private const NAME = 'Awa Ndiaye';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config()->set('sms.webhook_url_token', 'sms-url-token-602');
        config()->set('sms.webhook_allowed_ips.orange', []);
        config()->set('whatsapp.webhook_url_token', 'wa-url-token-602');
        config()->set('whatsapp.webhook_app_secret', '');
    }

    public function test_whatsapp_and_sms_payloads_leave_no_number_email_or_name_in_clear(): void
    {
        // VERIF-602 M4 — seule une requête AUTHENTIFIÉE garde corps et vue : l'accusé WhatsApp est
        // signé par le secret de l'application.
        config()->set('whatsapp.webhook_app_secret', 'wa-app-secret-602');
        $waBody = json_encode([
            'entry' => [[
                'changes' => [[
                    'field' => 'messages',
                    'value' => [
                        'contacts' => [['wa_id' => self::PHONE, 'profile' => ['name' => self::NAME]]],
                        'statuses' => [[
                            'id' => 'wamid.602',
                            'status' => 'failed',
                            'timestamp' => '1700000000',
                            'recipient_id' => self::PHONE,
                            'errors' => [['code' => 131026, 'title' => 'Undeliverable to '.self::EMAIL]],
                        ]],
                    ],
                ]],
            ]],
        ]);
        $this->call('POST', '/api/webhooks/whatsapp/status/wa-url-token-602', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $waBody, 'wa-app-secret-602'),
        ], $waBody)->assertOk();

        $this->postJson('/api/webhooks/sms/orange/status/sms-url-token-602', [
            'deliveryInfoNotification' => [
                'callbackData' => 'contact '.self::EMAIL,
                'deliveryInfo' => ['address' => 'tel:+'.self::PHONE, 'deliveryStatus' => 'DeliveredToTerminal', 'link' => 'orange-602'],
            ],
        ])->assertNotFound();

        $logs = IntegrationWebhookLog::query()->orderBy('id')->get();
        $this->assertCount(2, $logs);
        $this->assertSame('••••4567', data_get($logs[0]->payload, 'entry.0.changes.0.value.statuses.0.recipient_id'));
        $this->assertSame('••••4567', data_get($logs[1]->payload, 'deliveryInfoNotification.deliveryInfo.address'));
        $this->assertSame('contact [email]', data_get($logs[1]->payload, 'deliveryInfoNotification.callbackData'));

        $this->actingAsRole('super_admin');
        foreach ($logs as $log) {
            $shown = $this->getJson("/api/admin/webhook-logs/{$log->id}")->assertOk()->getContent();
            $listed = $this->getJson('/api/admin/webhook-logs?filter[channel]='.$log->channel)->assertOk()->getContent();
            foreach ([json_encode($log->payload), $shown, $listed] as $view) {
                $this->assertStringNotContainsString(self::PHONE, $view);
                $this->assertStringNotContainsString('awa.ndiaye', $view);
                $this->assertStringNotContainsString(self::NAME, $view);
            }
            $this->assertStringNotContainsString('"body"', $shown);
            $this->assertStringNotContainsString('"headers"', $shown);
        }

        // Le corps est gardé ENTIER pour le rejeu — et chiffré : la lecture brute n'y lit rien.
        $this->assertStringContainsString(self::PHONE, (string) $logs[0]->body);
        foreach (DB::table('integration_webhook_logs')->pluck('body') as $raw) {
            $this->assertStringNotContainsString(self::PHONE, (string) $raw);
            $this->assertStringNotContainsString('awa.ndiaye', (string) $raw);
        }
    }

    /**
     * La passe finale rattrape la valeur qu'une liste blanche laisse passer : un champ GARDÉ qui
     * porte un numéro ou une adresse ne sort pas en clair.
     */
    public function test_the_final_pass_masks_a_number_or_email_in_a_whitelisted_field(): void
    {
        $integration = $this->journalWaveIntegration(Agency::factory()->create());
        $this->postWave($integration, json_encode([
            'type' => 'checkout.session.completed',
            'data' => ['id' => 'cs_602_ref', 'client_reference' => self::PHONE.' / '.self::EMAIL, 'customer' => ['name' => self::NAME]],
        ]))->assertOk();

        $payload = IntegrationWebhookLog::query()->sole()->payload;
        $this->assertSame('••••4567 / [email]', data_get($payload, 'data.client_reference'));
        $this->assertNull(data_get($payload, 'data.customer'), 'Hors liste blanche : absent.');
    }

    public function test_mask_phone_keeps_only_the_last_four_digits(): void
    {
        $this->assertSame('••••4567', WebhookPayloadRedactor::maskPhone('tel:+221 77 123 45 67'));
        $this->assertSame('••••', WebhookPayloadRedactor::maskPhone('inconnu'));
    }
}
