<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\Drivers\LAfricaMobileSmsDriver;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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

    /**
     * P36.01 (TCK-795) — l'URL de rappel telle que le pilote l'envoie à LAM : `ret_url` capturé
     * dans la requête sortante, jamais reconstruit par le test.
     */
    private function retUrlEmisParLePilote(int $notificationId): string
    {
        Integration::query()->create([
            'provider' => 'sms_lafricamobile',
            'agency_id' => null,
            'credentials' => ['accountid' => 'lam-acc', 'password' => 'lam-pass', 'sender_id' => 'TAKUSSAN'],
            'metadata' => [],
            'is_active' => true,
        ]);
        Http::fake(['*' => Http::response(['push_id' => 'lam-envoi'], 200)]);

        $this->app->make(LAfricaMobileSmsDriver::class)
            ->send('+221761111111', 'Bonjour', ['notification_id' => $notificationId]);

        $retUrl = null;
        Http::assertSent(function ($request) use (&$retUrl): bool {
            $retUrl = $request->data()['ret_url'] ?? null;

            return $retUrl !== null;
        });

        return (string) $retUrl;
    }

    /** Ce que LAM ajoute au `ret_url` au rappel (LAMPUSH v2.3, `docs/integrations/sms.md`). */
    private function rappelDeLam(string $retUrl, string $pushId, int $status, string $text = 'DELIVRD'): string
    {
        return $retUrl.'&'.http_build_query([
            'push_id' => $pushId,
            'ret_id' => 'ret-'.$pushId,
            'to' => '221761111111',
            'status' => $status,
            'text' => $text,
        ]);
    }

    public function test_delivered_status_6_marks_delivered_on_the_ret_url_emitted_by_the_driver(): void
    {
        $n = $this->makeNotificationWithAttempt('lam-1');

        $this->getJson($this->rappelDeLam($this->retUrlEmisParLePilote($n->id), 'lam-1', 6))->assertOk();

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
        $url = $this->rappelDeLam($this->retUrlEmisParLePilote($n->id), 'lam-3', 6);

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
        // La signature couvre ce que NOUS signons (jeton, notification,
        // expiration) — pas les paramètres que LAM ajoute (P36.01). Changer
        // la notification visée ou l'expiration doit invalider l'URL.
        $n = $this->makeNotificationWithAttempt('lam-4');
        $autre = AppNotification::factory()->create(['user_id' => $n->user_id]);
        $retUrl = $this->retUrlEmisParLePilote($n->id);

        $autreNotification = str_replace("/{$n->id}?", "/{$autre->id}?", $retUrl);
        $this->assertNotSame($retUrl, $autreNotification);
        $this->getJson($this->rappelDeLam($autreNotification, 'lam-4', 6))->assertForbidden();

        $expiration = preg_replace_callback('/expires=(\d+)/', fn (array $m) => 'expires='.((int) $m[1] + 86400), $retUrl);
        $this->assertNotSame($retUrl, $expiration);
        $this->getJson($this->rappelDeLam($expiration, 'lam-4', 6))->assertForbidden();

        $this->assertSame(
            SmsResult::STATUS_SENT,
            NotificationDeliveryAttempt::query()->where('provider_message_id', 'lam-4')->first()->status,
        );
    }

    public function test_an_expired_ret_url_is_refused(): void
    {
        $n = $this->makeNotificationWithAttempt('lam-6');
        $retUrl = $this->retUrlEmisParLePilote($n->id);

        $this->travel(8)->days();

        $this->getJson($this->rappelDeLam($retUrl, 'lam-6', 6))->assertForbidden();
        $this->assertSame(
            SmsResult::STATUS_SENT,
            NotificationDeliveryAttempt::query()->where('provider_message_id', 'lam-6')->first()->status,
        );
    }

    public function test_a_wrong_url_token_is_refused_even_on_a_correctly_signed_url(): void
    {
        // Les deux gardes sont indépendantes : la signature prouve que l'URL
        // vient de nous, le jeton prouve qu'elle vise ce webhook-ci. Une URL
        // signée par nous avec un mauvais jeton doit rester refusée.
        $n = $this->makeNotificationWithAttempt('lam-5');
        $url = URL::temporarySignedRoute('sms.webhook.lafricamobile', now()->addDay(), [
            'token' => 'mauvais-jeton',
            'notification' => $n->id,
        ]);

        $this->getJson($this->rappelDeLam($url, 'lam-5', 6))->assertNotFound();

        $this->assertSame(
            SmsResult::STATUS_SENT,
            NotificationDeliveryAttempt::query()->where('provider_message_id', 'lam-5')->first()->status,
        );
    }
}
