<?php

namespace Tests\Feature\Webhooks;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\WebhookJournalFixture;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §5) — le rejeu d'une ligne du journal : par le MÊME gestionnaire, signature
 * revérifiée, sous l'autorité de l'intégration, une seule fois utile.
 */
class WebhookReplayTest extends TestCase
{
    use RefreshDatabase, WebhookJournalFixture;

    private static bool $explode = false;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        self::$explode = false;
        // L'exception « après la signature » (AC3) : l'écriture du statut du payable lève.
        BookingPayment::saving(function (BookingPayment $payment): void {
            if (self::$explode && $payment->isDirty('status')) {
                throw new RuntimeException('panne forcée après la signature');
            }
        });
    }

    /**
     * AC3 — une exception après la signature : ligne `failed`. Le rejeu solde le paiement ; un
     * second rejeu ne touche plus ni le paiement ni `gateway_events`.
     */
    public function test_a_failed_row_replays_once_into_a_paid_payment(): void
    {
        [$payment, $integration] = $this->arrange();

        self::$explode = true;
        $this->postWave($integration, $this->waveBody($payment->transaction_id))->assertStatus(500);
        self::$explode = false;

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_FAILED, $log->status);
        $this->assertSame(500, $log->http_status);
        $this->assertSame('exception', $log->error_code);
        $this->assertSame('RuntimeException', $log->error_message, 'La classe, jamais le message.');
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);

        $admin = $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/webhook-logs/{$log->id}/replay")
            ->assertOk()
            ->assertJsonPath('data.status', IntegrationWebhookLog::STATUS_PROCESSED)
            ->assertJsonPath('data.matched_count', 1)
            ->assertJsonPath('data.attempts', 1);

        $payment->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $events = $payment->metadata['gateway_events'];
        $this->assertCount(1, $events);
        $this->assertSame($admin->id, $log->refresh()->replayed_by_id);
        $this->assertTrue(Activity::query()->where('event', 'super_admin_webhook_replayed')->where('subject_id', $log->id)->exists());

        $this->postJson("/api/admin/webhook-logs/{$log->id}/replay")
            ->assertStatus(422)
            ->assertJsonPath('code', 'webhook_log.not_replayable');

        // Le fournisseur renvoie lui-même le webhook après le rejeu : rien de neuf non plus.
        $this->postWave($integration, $this->waveBody($payment->transaction_id))->assertOk();

        $after = $payment->fresh();
        $this->assertSame(PaymentStatus::Paid, $after->status);
        $this->assertSame($events, $after->metadata['gateway_events']);
        $this->assertSame(1, $log->refresh()->attempts);
    }

    /**
     * AC4 — une ligne non authentifiée ne se rejoue jamais : la ligne `rejected` du chemin réel, et
     * une ligne que rien n'a authentifiée même si son statut dit « en échec ».
     */
    public function test_an_unauthenticated_row_is_never_replayed(): void
    {
        [$payment, $integration] = $this->arrange();
        $this->postWave($integration, $this->waveBody($payment->transaction_id), 'mauvais')->assertStatus(401);
        $rejected = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_REJECTED, $rejected->status);

        // La même ligne, statut forcé à `failed` : seule `authenticated_at` la refuse encore.
        $forged = $rejected->replicate();
        $forged->forceFill(['status' => IntegrationWebhookLog::STATUS_FAILED, 'body' => $rejected->body])->save();
        // Et le corps signé JUSTE : sans la condition sur l'authentification, le rejeu solderait.
        $ts = time();
        $forged->forceFill([
            'headers' => ['content-type' => 'application/json', 'wave-signature' => "t={$ts},v1=".hash_hmac('sha256', $ts.'.'.$rejected->body, $this->journalWaveSecret)],
            'integration_id' => $integration->id,
        ])->save();

        $this->actingAsRole('super_admin');
        foreach ([$rejected, $forged] as $log) {
            $this->postJson("/api/admin/webhook-logs/{$log->id}/replay")
                ->assertStatus(422)
                ->assertJsonPath('code', 'webhook_log.not_replayable');
            $this->assertSame(0, $log->refresh()->attempts);
            $this->assertNull($log->replayed_at);
        }
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
    }

    /**
     * AC5 — un webhook arrivé AVANT que le payable ne porte sa transaction : non apparié. Le rejeu
     * le solde, parce que la signature recalculée sur `body` déchiffré est identique ; un octet
     * altéré de `body`, et le rejeu est rejeté.
     */
    public function test_replay_re_verifies_the_signature_on_the_stored_body(): void
    {
        [$payment, $integration] = $this->arrange(['transaction_id' => null, 'metadata' => []]);
        $this->postWave($integration, $this->waveBody('cs_602_late'))->assertOk();
        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame(0, $log->matched_count);

        $tampered = $log->replicate();
        $tampered->forceFill(['body' => str_replace('cs_602_late', 'cs_602_lath', (string) $log->body)])->save();

        $payment->forceFill(['transaction_id' => 'cs_602_late', 'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_602_late']]])->save();

        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/webhook-logs/{$tampered->id}/replay")
            ->assertOk()
            ->assertJsonPath('data.status', IntegrationWebhookLog::STATUS_REJECTED)
            ->assertJsonPath('data.http_status', 401);
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);

        $this->postJson("/api/admin/webhook-logs/{$log->id}/replay")
            ->assertOk()
            ->assertJsonPath('data.status', IntegrationWebhookLog::STATUS_PROCESSED)
            ->assertJsonPath('data.matched_count', 1);
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    /** AC11 — une ligne au corps tronqué n'est pas rejouable : 422. */
    public function test_a_truncated_row_is_not_replayable(): void
    {
        $integration = $this->journalWaveIntegration(Agency::factory()->create());
        $body = json_encode(['type' => 'checkout.session.completed', 'data' => ['id' => 'cs_big'], 'padding' => str_repeat('b', 300 * 1024)]);
        $this->postWave($integration, $body)->assertOk();
        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_PROCESSED, $log->status);
        $this->assertSame(0, $log->matched_count);
        $this->assertNotNull($log->authenticated_at);

        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/webhook-logs/{$log->id}/replay")->assertStatus(422);
        $this->assertSame(0, $log->refresh()->attempts);
    }

    /** Une intégration désactivée depuis ne rejoue rien : son autorité n'existe plus. */
    public function test_a_disabled_integration_replays_nothing(): void
    {
        [$payment, $integration] = $this->arrange(['transaction_id' => null, 'metadata' => []]);
        $this->postWave($integration, $this->waveBody('cs_602_off'))->assertOk();
        $log = IntegrationWebhookLog::query()->sole();
        $payment->forceFill(['transaction_id' => 'cs_602_off', 'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_602_off']]])->save();
        $integration->forceFill(['is_active' => false])->save();

        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/webhook-logs/{$log->id}/replay")
            ->assertOk()
            ->assertJsonPath('data.status', IntegrationWebhookLog::STATUS_REJECTED)
            ->assertJsonPath('data.error_code', 'webhook_log.integration_unavailable');
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
    }

    /**
     * Le rejeu est un geste de console sensible : super-admin, second facteur RÉCENT (step-up).
     * Sans step-up, sans 2FA, ou depuis une agence : rien ne se rejoue.
     */
    public function test_replay_requires_a_super_admin_with_a_fresh_second_factor(): void
    {
        [$payment, $integration] = $this->arrange(['transaction_id' => null, 'metadata' => []]);
        $this->postWave($integration, $this->waveBody('cs_602_auth'))->assertOk();
        $log = IntegrationWebhookLog::query()->sole();
        $payment->forceFill(['transaction_id' => 'cs_602_auth', 'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_602_auth']]])->save();
        $url = "/api/admin/webhook-logs/{$log->id}/replay";

        // Super-admin dont le second facteur date d'une heure : step-up expiré.
        $stale = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP']);
        $this->materializeRoleProfile($stale, 'super_admin');
        $this->actingAs($stale);
        $this->postJson($url)->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');

        $agency = Agency::factory()->create();
        foreach (['agency_admin', 'agent'] as $role) {
            $this->actingAsRole($role, ['agency' => $agency]);
            $this->postJson($url)->assertForbidden();
            $this->getJson('/api/admin/webhook-logs')->assertForbidden();
            $this->getJson("/api/admin/webhook-logs/{$log->id}")->assertForbidden();
        }

        $this->assertSame(0, $log->refresh()->attempts);
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array{0: BookingPayment, 1: Integration}
     */
    private function arrange(array $overrides = []): array
    {
        $agency = Agency::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id])->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
            'currency' => Currency::XOF,
        ]);
        $payment = BookingPayment::factory()->create($overrides + [
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => 'cs_602_'.$agency->id,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_602_'.$agency->id]],
        ]);

        return [$payment, $this->journalWaveIntegration($agency)];
    }
}
