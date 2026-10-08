<?php

namespace Tests\Feature\Webhooks;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Webhooks\WebhookJournal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\URL;
use Tests\Support\LeaseDueFixture;
use Tests\Support\WebhookJournalFixture;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §4) — une ligne par webhook entrant, écrite AVANT tout traitement, sur les
 * trois canaux : rejetée, traitée, non appariée ou en échec, elle existe.
 */
class WebhookJournalTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase, WebhookJournalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config()->set('sms.webhook_url_token', 'sms-url-token-602');
        config()->set('sms.webhook_allowed_ips.orange', []);
        config()->set('whatsapp.webhook_url_token', 'wa-url-token-602');
        config()->set('whatsapp.webhook_app_secret', '');
    }

    /** AC1 — signature invalide : UNE ligne `rejected`, non authentifiée, `http_status = 401`. */
    public function test_an_invalid_signature_leaves_one_rejected_row(): void
    {
        $integration = $this->journalWaveIntegration(Agency::factory()->create());

        $this->postWave($integration, $this->waveBody('txn_x'), 'mauvais')->assertStatus(401);

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_REJECTED, $log->status);
        $this->assertNull($log->authenticated_at);
        $this->assertSame(401, $log->http_status);
        $this->assertSame('payment', $log->channel);
        $this->assertSame('wave', $log->provider);
        $this->assertNull($log->integration_id, 'Un appel non authentifié ne se rattache à rien.');
    }

    /**
     * VERIF-602 M4 — une requête NON authentifiée ne laisse pas son corps : 250 Ko postés sur un
     * jeton inconnu, et sur une intégration réelle à la signature fausse, laissent chacun une ligne
     * de moins de 2 Ko — ni corps, ni en-têtes, ni vue ; la taille reçue seule.
     */
    public function test_an_unauthenticated_request_leaves_a_small_row_without_its_body(): void
    {
        $integration = $this->journalWaveIntegration(Agency::factory()->create());
        $huge = json_encode(['type' => 'checkout.session.completed', 'data' => ['id' => 'txn_x', 'pad' => str_repeat('z', 250_000)]]);

        $this->call('POST', '/api/webhooks/payments/wave/'.str_repeat('z', 43), [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => 't=1,v1='.str_repeat('0', 64),
        ], $huge)->assertNotFound();
        $this->postWave($integration, $huge, 'mauvais')->assertStatus(401);

        $rows = DB::table('integration_webhook_logs')->orderBy('id')->get();
        $this->assertCount(2, $rows);
        foreach ($rows as $row) {
            $this->assertSame('rejected', $row->status);
            $this->assertNull($row->body);
            $this->assertNull(IntegrationWebhookLog::query()->find($row->id)->body);
            $this->assertSame([], IntegrationWebhookLog::query()->find($row->id)->headers);
            $this->assertSame(['body_bytes' => strlen($huge)], json_decode((string) $row->payload, true));
            $size = (int) DB::selectOne('SELECT pg_column_size(t.*) AS n FROM integration_webhook_logs t WHERE id = ?', [$row->id])->n;
            $this->assertLessThan(2048, $size, "ligne {$row->id} : {$size} octets");
        }
    }

    /**
     * VERIF-602 m2 — l'empreinte du corps n'est pas un oracle : c'est un HMAC sous la clé de
     * l'application (pas un SHA-256 nu, qu'une force brute renverse), et l'API ne la rend pas.
     */
    public function test_the_body_digest_is_keyed_and_never_returned(): void
    {
        $integration = $this->journalWaveIntegration(Agency::factory()->create());
        $body = $this->waveBody('txn_digest');
        $this->postWave($integration, $body)->assertOk();

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertNotSame(hash('sha256', $body), $log->body_sha256);
        $this->assertSame(hash_hmac('sha256', $body, (string) config('app.key')), $log->body_sha256);

        $this->actingAsRole('super_admin');
        $shown = $this->getJson("/api/admin/webhook-logs/{$log->id}")->assertOk()->getContent();
        $listed = $this->getJson('/api/admin/webhook-logs')->assertOk()->getContent();
        $this->getJson('/api/admin/webhook-logs?fields[integration_webhook_logs]=id,body_sha256')->assertStatus(400);
        foreach ([$shown, $listed] as $view) {
            $this->assertStringNotContainsString('body_sha256', $view);
            $this->assertStringNotContainsString($log->body_sha256, $view);
        }
    }

    /** AC2 — authentifié, sans payable : `processed`, `matched_count = 0`, et `filter[unmatched]=1` le rend. */
    public function test_an_unmatched_webhook_is_processed_with_zero_matches_and_listed_as_unmatched(): void
    {
        $ctx = $this->leaseDue();
        $integration = Integration::query()->where('agency_id', $ctx['agency']->id)->where('provider', 'wave')->firstOrFail();
        $this->waveWebhook('txn_inconnu_602', null)->assertOk();

        $unmatched = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_PROCESSED, $unmatched->status);
        $this->assertSame(0, $unmatched->matched_count);
        $this->assertSame('txn_inconnu_602', $unmatched->external_id);
        $this->assertNotNull($unmatched->authenticated_at);
        $this->assertSame($integration->id, $unmatched->integration_id);

        // Un webhook rejeté n'est pas « non apparié » : le filtre ne le rend pas.
        $this->postWave($integration, $this->waveBody('txn_autre'), 'mauvais')->assertStatus(401);

        $this->actingAsRole('super_admin');
        $this->getJson('/api/admin/webhook-logs?filter[unmatched]=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $unmatched->id)
            ->assertJsonPath('data.0.matched_count', 0)
            ->assertJsonPath('data.0.replayable', true);

        // La console lit en champs clairsemés : `replayable` s'y juge sans `body`, qui n'est pas lisible.
        $this->getJson('/api/admin/webhook-logs?filter[unmatched]=1&fields[integration_webhook_logs]=id,status,authenticated_at,body_truncated,matched_count')
            ->assertOk()
            ->assertJsonPath('data.0.replayable', true)
            ->assertJsonMissingPath('data.0.payload');
        $this->getJson('/api/admin/webhook-logs?fields[integration_webhook_logs]=id,body')->assertStatus(400);
    }

    /**
     * AC9 — validé par l'intégration de l'agence A, la ligne est rattachée à A, jamais à
     * l'intégration globale du fournisseur, même quand celle-ci existe et précède.
     */
    public function test_a_webhook_validated_by_agency_a_is_attached_to_a(): void
    {
        $this->journalWaveIntegration(null);
        $agencyA = Agency::factory()->create();
        $integrationA = $this->journalWaveIntegration($agencyA);

        $this->postWave($integrationA, $this->waveBody('txn_a'))->assertOk();

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame($integrationA->id, $log->integration_id);
        $this->assertSame($agencyA->id, $log->agency_id);
    }

    /**
     * AC11 — 10 000 octets gardés à l'identique, chiffrés ; 300 Kio : rien de gardé, ligne marquée
     * tronquée (et non rejouable, {@see WebhookReplayTest}).
     */
    public function test_the_body_is_kept_byte_for_byte_up_to_the_limit(): void
    {
        $integration = $this->journalWaveIntegration(Agency::factory()->create());
        $prefix = $this->waveBody('txn_10k', extra: ['padding' => '']);
        $body = substr($prefix, 0, -2).str_repeat('a', 10_000 - strlen($prefix)).'"}';
        $this->assertSame(10_000, strlen($body));

        $this->postWave($integration, $body)->assertOk();

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame($body, $log->body);
        $this->assertSame(WebhookJournal::bodyDigest($body), $log->body_sha256);
        $this->assertFalse($log->body_truncated);
        $this->assertStringNotContainsString('aaaaaaaaaa', (string) DB::table('integration_webhook_logs')->value('body'), 'Le corps est chiffré en base.');

        $big = substr($prefix, 0, -2).str_repeat('b', 300 * 1024).'"}';
        $this->postWave($integration, $big)->assertOk();

        $truncated = IntegrationWebhookLog::query()->latest('id')->firstOrFail();
        $this->assertNull($truncated->body);
        $this->assertTrue($truncated->body_truncated);
        $this->assertSame(WebhookJournal::bodyDigest($big), $truncated->body_sha256);
        $this->assertFalse($truncated->isReplayable());
    }

    /**
     * AC12 — Orange SMS : hors liste d'IP, `rejected` 403 ; authentifié sans envoi apparié, 404
     * attendu par le fournisseur mais `processed`, `matched_count = 0`.
     */
    public function test_orange_sms_rejections_and_unmatched_acknowledgements_are_journalised(): void
    {
        config()->set('sms.webhook_allowed_ips.orange', ['10.9.9.9']);
        $this->postJson('/api/webhooks/sms/orange/status/sms-url-token-602', $this->orangeDlr('orange-602'))->assertForbidden();

        $rejected = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_REJECTED, $rejected->status);
        $this->assertSame('sms', $rejected->channel);
        $this->assertSame('orange', $rejected->provider);
        $this->assertSame(403, $rejected->http_status);

        config()->set('sms.webhook_allowed_ips.orange', []);
        $this->postJson('/api/webhooks/sms/orange/status/sms-url-token-602', $this->orangeDlr('inconnu-602'))->assertNotFound();

        $unmatched = IntegrationWebhookLog::query()->latest('id')->firstOrFail();
        $this->assertSame(IntegrationWebhookLog::STATUS_PROCESSED, $unmatched->status);
        $this->assertSame(0, $unmatched->matched_count);
        $this->assertSame(404, $unmatched->http_status);
        $this->assertNotNull($unmatched->authenticated_at);
    }

    /** Un accusé Orange apparié : `processed`, `matched_count = 1`, identifiant externe gardé. */
    public function test_a_matched_orange_acknowledgement_counts_one(): void
    {
        $this->orangeAttempt('orange-ok-602');

        $this->postJson('/api/webhooks/sms/orange/status/sms-url-token-602', $this->orangeDlr('orange-ok-602'))->assertOk();

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_PROCESSED, $log->status);
        $this->assertSame(1, $log->matched_count);
        $this->assertSame('orange-ok-602', $log->external_id);
    }

    /**
     * AC7 — le segment `{token}` des URL SMS et WhatsApp, et la signature d'URL LAfricaMobile,
     * n'apparaissent dans AUCUNE colonne d'une ligne de journal (corps déchiffré compris).
     */
    public function test_url_tokens_never_reach_a_journal_column(): void
    {
        $this->orangeAttempt('orange-tok-602');
        $this->postJson('/api/webhooks/sms/orange/status/sms-url-token-602', $this->orangeDlr('orange-tok-602'))->assertOk();
        $this->postJson('/api/webhooks/sms/mtarget/status/sms-url-token-602', ['MsgId' => 'm-602', 'Status' => '3'])->assertNotFound();
        $this->postJson('/api/webhooks/whatsapp/status/wa-url-token-602', ['entry' => []])->assertOk();
        $this->postJson('/api/webhooks/whatsapp/status/mauvais-wa-602', ['entry' => []])->assertNotFound();

        $notification = AppNotification::factory()->create(['user_id' => User::factory()->create()->id]);
        $signed = URL::signedRoute('sms.webhook.lafricamobile', ['token' => 'sms-url-token-602', 'notification' => $notification->id, 'push_id' => 'lam-602', 'status' => 6]);
        $this->getJson($signed)->assertNotFound();
        parse_str((string) parse_url($signed, PHP_URL_QUERY), $signedQuery);
        $urlSignature = (string) ($signedQuery['signature'] ?? '');
        $this->assertNotSame('', $urlSignature);

        $this->assertSame(5, IntegrationWebhookLog::query()->count());
        $raw = json_encode(DB::table('integration_webhook_logs')->get());
        $decrypted = json_encode(IntegrationWebhookLog::query()->get()->map(fn (IntegrationWebhookLog $l) => [$l->body, $l->headers, $l->payload])->all());
        foreach (['sms-url-token-602', 'wa-url-token-602', 'mauvais-wa-602', $urlSignature] as $secret) {
            $this->assertStringNotContainsString($secret, $raw);
            $this->assertStringNotContainsString($secret, $decrypted);
        }
    }

    /**
     * VERIF-602 m3 (S1) — ni `Authorization` ni cookie n'entrent au journal, sur aucun canal : la
     * liste blanche ne les nomme pas, et une requête AUTHENTIFIÉE qui les porte n'en garde rien.
     */
    public function test_authorization_and_cookies_are_never_journaled(): void
    {
        $forbidden = ['authorization', 'proxy-authorization', 'cookie', 'set-cookie'];
        foreach (WebhookJournal::HEADER_WHITELIST as $channel => $names) {
            $this->assertSame([], array_values(array_intersect($forbidden, array_map('strtolower', $names))), $channel);
        }

        $integration = $this->journalWaveIntegration(Agency::factory()->create());
        $body = $this->waveBody('txn_s1');
        $ts = time();
        $this->call('POST', '/api/webhooks/payments/wave/'.$integration->webhook_token, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => "t={$ts},v1=".hash_hmac('sha256', $ts.'.'.$body, $this->journalWaveSecret),
            'HTTP_AUTHORIZATION' => 'Bearer bearer-602-secret',
            'HTTP_COOKIE' => 'session=cookie-602-secret',
        ], $body)->assertOk();

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertNotNull($log->authenticated_at, 'Authentifiée : ses en-têtes sont écrits.');
        $this->assertSame(['content-type', 'wave-signature'], array_keys($log->headers));
        $this->assertStringNotContainsString('602-secret', (string) json_encode($log->headers));
    }

    private function orangeDlr(string $messageId): array
    {
        return [
            'deliveryInfoNotification' => [
                'callbackData' => 'cb',
                'deliveryInfo' => ['address' => 'tel:+221771111111', 'deliveryStatus' => 'DeliveredToTerminal', 'link' => 'https://api.orange.com/x/'.$messageId],
            ],
        ];
    }

    private function orangeAttempt(string $messageId): void
    {
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => AppNotification::factory()->create(['user_id' => User::factory()->create()->id])->id,
            'attempt' => 1,
            'provider' => 'orange',
            'to' => '+221771111111',
            'status' => SmsResult::STATUS_SENT,
            'provider_message_id' => $messageId,
            'sent_at' => now(),
        ]);
    }
}
