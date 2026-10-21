<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\UpdateWhatsappDeliveryStatusJob;
use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-1092 (P72.01) — un accusé `failed` de Meta reçu après l'acceptation d'un message WhatsApp
 * met en file le SMS de la même notification, une seule fois. Avant, `WhatsappChannel` ne se
 * repliait que sur l'échec rendu par l'appel lui-même, et l'accusé ne faisait qu'écrire la tentative.
 */
class LateWhatsappFailureSmsFallbackTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = '+221770001122';

    private FakeSmsRouter $sms;

    private AppNotification $ligne;

    protected function setUp(): void
    {
        parent::setUp();
        // Midi à Dakar : hors des heures calmes ARTP (22 h – 6 h).
        $this->travelTo(CarbonImmutable::parse('2026-10-21 12:00:00', 'Africa/Dakar'));
        $this->sms = FakeSmsRouter::install();

        $user = User::factory()->create(['phone' => self::PHONE, 'phone_verified_at' => now()]);
        Notification::fake();
        $this->ligne = app(NotificationService::class)->send($user, NotificationCode::LeasePaymentOverdue, [
            'amount' => 150000, 'days' => 5, 'due_date' => '2026-10-16', 'property' => 'Villa Ngor',
        ]);
    }

    private function tentativeWhatsapp(?\DateTimeInterface $envoyeeLe = null): NotificationDeliveryAttempt
    {
        return NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $this->ligne->id,
            'attempt' => 1,
            'provider' => 'whatsapp_cloud',
            'provider_message_id' => 'wamid.X',
            'to' => self::PHONE,
            'status' => 'sent',
            'sent_at' => $envoyeeLe ?? now()->subMinutes(10),
        ]);
    }

    private function accuse(string $statut = 'failed'): void
    {
        (new UpdateWhatsappDeliveryStatusJob('wamid.X', $statut, '131026: Message undeliverable'))
            ->handle(app(DeliveryAttemptUpdater::class));
    }

    public function test_un_failed_tardif_rejoue_deux_fois_envoie_un_seul_sms_de_la_meme_notification(): void
    {
        $this->tentativeWhatsapp();

        $this->accuse();
        $this->accuse();

        $envois = $this->sms->sentTo(self::PHONE);
        $this->assertCount(1, $envois);
        $this->assertSame($this->ligne->id, $envois[0]['context']['notification_id']);
        $this->assertFalse($envois[0]['context']['is_critical']);
        $this->assertStringContainsString('Villa Ngor', $envois[0]['message']);
    }

    public function test_aucun_sms_quand_une_tentative_sms_existe_deja_pour_la_notification(): void
    {
        $this->tentativeWhatsapp();
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $this->ligne->id, 'attempt' => 2, 'provider' => 'orange',
            'to' => self::PHONE, 'status' => 'sent',
        ]);

        $this->accuse();

        $this->assertSame([], $this->sms->sent);
    }

    public function test_aucun_sms_quand_l_accuse_arrive_plus_d_une_heure_apres_l_envoi(): void
    {
        $this->tentativeWhatsapp(now()->subMinutes(61));

        $this->accuse();

        $this->assertSame([], $this->sms->sent);
    }

    public function test_aucun_sms_pendant_les_heures_calmes(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-21 23:00:00', 'Africa/Dakar'));
        $this->tentativeWhatsapp();

        $this->accuse();

        $this->assertSame([], $this->sms->sent);
    }

    public function test_un_accuse_delivered_n_envoie_rien(): void
    {
        $this->tentativeWhatsapp();

        $this->accuse('delivered');

        $this->assertSame([], $this->sms->sent);
    }
}
