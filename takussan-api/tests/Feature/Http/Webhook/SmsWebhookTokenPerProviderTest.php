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
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * P36.04 (TCK-943) — un jeton d'URL par fournisseur SMS. Le pilote LAM écrit son jeton en clair
 * dans le `ret_url` de chaque SMS : il circule chez LAM. Il ne doit ouvrir que la route de LAM.
 * Tant qu'un fournisseur n'a pas son jeton propre, la clé commune `SMS_WEBHOOK_URL_TOKEN` le
 * remplace (le temps de la bascule) ; dès qu'il l'a, elle ne l'ouvre plus.
 */
class SmsWebhookTokenPerProviderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.webhook_url_token', 'jeton-commun');
        config()->set('sms.webhook_url_tokens', ['orange' => 'jeton-orange', 'mtarget' => 'jeton-mtarget', 'lafricamobile' => 'jeton-lam']);
        foreach (['orange', 'mtarget', 'lafricamobile'] as $provider) {
            config()->set("sms.webhook_allowed_ips.{$provider}", []);
        }
    }

    private function attempt(string $provider, string $providerMessageId): AppNotification
    {
        $notification = AppNotification::factory()->create(['user_id' => User::factory()->create()->id]);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => $provider,
            'to' => '+221771111111',
            'status' => SmsResult::STATUS_SENT,
            'provider_message_id' => $providerMessageId,
            'sent_at' => now(),
        ]);

        return $notification;
    }

    private function postOrange(string $token, string $messageId): TestResponse
    {
        return $this->postJson("/api/webhooks/sms/orange/status/{$token}", [
            'deliveryInfoNotification' => ['deliveryInfo' => [
                'deliveryStatus' => 'DeliveredToTerminal',
                'link' => "https://api.orange.com/x/y/{$messageId}",
            ]],
        ]);
    }

    private function postMtarget(string $token, string $ticket): TestResponse
    {
        return $this->post("/api/webhooks/sms/mtarget/status/{$token}", ['MsgId' => $ticket, 'Status' => 3]);
    }

    /** Le `ret_url` tel que le pilote l'envoie à LAM, capturé dans la requête sortante. */
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

        [$request] = Http::recorded()->last();
        $retUrl = $request->data()['ret_url'] ?? null;
        $this->assertIsString($retUrl);

        return $retUrl;
    }

    private function jetonDuRetUrl(string $retUrl): string
    {
        preg_match('#/lafricamobile/status/([^/]+)/#', $retUrl, $m);

        return $m[1] ?? '';
    }

    public function test_the_lam_ret_url_carries_the_lam_token_and_it_does_not_open_the_orange_route(): void
    {
        $notification = $this->attempt('lafricamobile', 'lam-1');
        $retUrl = $this->retUrlEmisParLePilote($notification->id);
        $jetonLam = $this->jetonDuRetUrl($retUrl);
        $this->assertSame('jeton-lam', $jetonLam, 'Le ret_url porte le jeton de LAM, pas la clé commune.');

        $this->attempt('orange', 'orange-1');
        $this->postOrange($jetonLam, 'orange-1')->assertNotFound();
        $this->postMtarget($jetonLam, 'mtg-1')->assertNotFound();
        $this->assertSame(SmsResult::STATUS_SENT, NotificationDeliveryAttempt::query()->where('provider_message_id', 'orange-1')->value('status'));

        // Le même rappel, sur sa route, passe.
        $this->getJson($retUrl.'&push_id=lam-1&status=6')->assertOk();
    }

    public function test_each_route_accepts_its_own_token_only(): void
    {
        $this->attempt('orange', 'orange-2');
        $this->attempt('mtarget', 'mtg-2');

        $this->postOrange('jeton-mtarget', 'orange-2')->assertNotFound();
        $this->postOrange('jeton-commun', 'orange-2')->assertNotFound();
        $this->postOrange('jeton-orange', 'orange-2')->assertOk();

        $this->postMtarget('jeton-orange', 'mtg-2')->assertNotFound();
        $this->postMtarget('jeton-commun', 'mtg-2')->assertNotFound();
        $this->postMtarget('jeton-mtarget', 'mtg-2')->assertOk();
    }

    public function test_an_empty_own_token_falls_back_to_the_common_token(): void
    {
        config()->set('sms.webhook_url_tokens', ['orange' => '', 'mtarget' => '', 'lafricamobile' => '']);
        $this->attempt('orange', 'orange-3');
        $this->attempt('mtarget', 'mtg-3');
        $notification = $this->attempt('lafricamobile', 'lam-3');

        $this->postOrange('jeton-commun', 'orange-3')->assertOk();
        $this->postMtarget('jeton-commun', 'mtg-3')->assertOk();

        $retUrl = $this->retUrlEmisParLePilote($notification->id);
        $this->assertSame('jeton-commun', $this->jetonDuRetUrl($retUrl));
        $this->getJson($retUrl.'&push_id=lam-3&status=6')->assertOk();
    }

    /**
     * L'état cible de la bascule : les trois jetons propres posés, la clé commune VIDE. Le pilote
     * LAM doit encore écrire son `ret_url` (sinon tous les accusés LAM se perdent sans bruit), et
     * chaque route n'accepter que son jeton.
     */
    public function test_own_tokens_alone_work_once_the_common_key_is_emptied(): void
    {
        config()->set('sms.webhook_url_token', '');
        $this->attempt('orange', 'orange-5');
        $this->attempt('mtarget', 'mtg-5');
        $notification = $this->attempt('lafricamobile', 'lam-5');

        $retUrl = $this->retUrlEmisParLePilote($notification->id);
        $this->assertSame('jeton-lam', $this->jetonDuRetUrl($retUrl));
        $this->getJson($retUrl.'&push_id=lam-5&status=6')->assertOk();

        $this->postOrange('jeton-commun', 'orange-5')->assertNotFound();
        $this->postOrange('jeton-lam', 'orange-5')->assertNotFound();
        $this->postOrange('jeton-orange', 'orange-5')->assertOk();

        $this->postMtarget('jeton-commun', 'mtg-5')->assertNotFound();
        $this->postMtarget('jeton-mtarget', 'mtg-5')->assertOk();
    }

    public function test_no_token_at_all_still_fails_closed(): void
    {
        config()->set('sms.webhook_url_token', '');
        config()->set('sms.webhook_url_tokens', ['orange' => '', 'mtarget' => '', 'lafricamobile' => '']);
        $this->attempt('orange', 'orange-4');

        $this->postOrange('', 'orange-4')->assertNotFound();
        $this->postOrange('jeton-commun', 'orange-4')->assertNotFound();
    }
}
