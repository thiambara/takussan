<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class LAfricaMobileSmsWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.webhook_url_token', 'tck-102-token');
        config()->set('sms.webhook_allowed_ips.lafricamobile', []);
    }

    private function makeNotificationWithAttempt(string $pushId): AppNotification
    {
        $user = User::factory()->create();
        $notification = AppNotification::factory()->create(['user_id' => $user->id]);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => 'lafricamobile',
            'to' => '+221761111111',
            'status' => SmsResult::STATUS_SENT,
            'provider_message_id' => $pushId,
            'sent_at' => now(),
        ]);

        return $notification;
    }

    public function test_delivered_status_6_marks_delivered_on_signed_url(): void
    {
        $n = $this->makeNotificationWithAttempt('lam-1');
        $url = URL::signedRoute('sms.webhook.lafricamobile', [
            'token' => 'tck-102-token',
            'notification' => $n->id,
            'push_id' => 'lam-1',
            'status' => 6,
            'text' => 'DELIVRD',
        ]);
        $response = $this->getJson($url);
        $response->assertOk();
        $attempt = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)
            ->where('provider_message_id', 'lam-1')
            ->first();
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempt->status);
    }

    public function test_unsigned_url_returns_403(): void
    {
        $n = $this->makeNotificationWithAttempt('lam-2');
        $response = $this->getJson("/api/webhooks/sms/lafricamobile/status/tck-102-token/{$n->id}?push_id=lam-2&status=6");
        $response->assertForbidden();
    }

    // ─── TCK-285 ─────────────────────────────────────────────────

    public function test_replaying_the_same_signed_url_is_idempotent(): void
    {
        // L'URL est signée et donc rejouable telle quelle par quiconque l'a
        // vue passer (journaux, proxy de l'opérateur). Le rejeu ne doit ni
        // dupliquer la tentative, ni faire régresser son statut.
        $n = $this->makeNotificationWithAttempt('lam-3');
        $url = URL::signedRoute('sms.webhook.lafricamobile', [
            'token' => 'tck-102-token',
            'notification' => $n->id,
            'push_id' => 'lam-3',
            'status' => 6,
            'text' => 'DELIVRD',
        ]);

        $this->getJson($url)->assertOk();
        $this->getJson($url);

        $attempts = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)
            ->where('provider_message_id', 'lam-3')
            ->get();

        $this->assertCount(1, $attempts);
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempts->first()->status);
    }

    public function test_a_tampered_signed_url_is_refused(): void
    {
        // La signature couvre la CHAÎNE de requête : changer le statut après
        // coup doit invalider l'URL. Sans ce cas, on ne distingue pas « URL
        // signée » de « URL contenant une signature ».
        $n = $this->makeNotificationWithAttempt('lam-4');
        $url = URL::signedRoute('sms.webhook.lafricamobile', [
            'token' => 'tck-102-token',
            'notification' => $n->id,
            'push_id' => 'lam-4',
            'status' => 6,
            'text' => 'DELIVRD',
        ]);

        $this->getJson(str_replace('status=6', 'status=1', $url))->assertForbidden();

        $this->assertSame(
            SmsResult::STATUS_SENT,
            NotificationDeliveryAttempt::query()->where('provider_message_id', 'lam-4')->first()->status,
        );
    }

    public function test_a_wrong_url_token_is_refused_even_on_a_correctly_signed_url(): void
    {
        // Les deux gardes sont indépendantes : la signature prouve que l'URL
        // vient de nous, le jeton prouve qu'elle vise ce webhook-ci. Une URL
        // signée par nous avec un mauvais jeton doit rester refusée.
        $n = $this->makeNotificationWithAttempt('lam-5');
        $url = URL::signedRoute('sms.webhook.lafricamobile', [
            'token' => 'mauvais-jeton',
            'notification' => $n->id,
            'push_id' => 'lam-5',
            'status' => 6,
            'text' => 'DELIVRD',
        ]);

        $this->getJson($url)->assertNotFound();

        $this->assertSame(
            SmsResult::STATUS_SENT,
            NotificationDeliveryAttempt::query()->where('provider_message_id', 'lam-5')->first()->status,
        );
    }
}
