<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\UpdateWhatsappDeliveryStatusJob;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Models\WhatsappContact;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * P207.02 (TCK-2159) — la tentative WhatsApp d'un contact sans compte est journalisée sans
 * notification, comme le SMS (TCK-799) : l'accusé de Meta la retrouve et l'indicateur de santé la
 * compte. Le secours SMS d'un contact sans compte ne vaut que pour l'échec immédiat : un `failed`
 * tardif ne fait partir aucun SMS (`docs/features.md`, relances de loyer).
 *
 * Rouge avant le correctif : `WhatsappChannel::logAttempt()` sortait sans rien écrire quand la
 * notification n'avait pas de ligne `app_notifications`.
 */
class WhatsappContactSansCompteJournaliseTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = '+221771234568';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        // Midi à Dakar : hors des heures calmes ARTP (22 h – 6 h).
        $this->travelTo(CarbonImmutable::parse('2026-10-21 12:00:00', 'Africa/Dakar'));
        $this->sms = FakeSmsRouter::install();
        Integration::create([
            'provider' => 'whatsapp_cloud',
            'agency_id' => null,
            'credentials' => ['phone_number_id' => '123456', 'access_token' => 'tok'],
            'is_active' => true,
        ]);
        config()->set('whatsapp.default_driver', 'cloud');
        WhatsappContact::create([
            'phone' => self::PHONE,
            'opt_in_status' => WhatsappContact::OPT_IN_OPTED_IN,
            'last_inbound_at' => now()->subHour(),
        ]);
    }

    public function test_la_tentative_whatsapp_d_un_contact_est_journalisee_et_un_failed_tardif_n_envoie_pas_de_sms(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.C1']]], 200)]);

        $this->envoyer();

        $tentative = NotificationDeliveryAttempt::query()->sole();
        $this->assertNull($tentative->app_notification_id);
        $this->assertSame('whatsapp_cloud', $tentative->provider);
        $this->assertSame('wamid.C1', $tentative->provider_message_id);
        $this->assertSame('sent', $tentative->status);

        (new UpdateWhatsappDeliveryStatusJob('wamid.C1', 'failed', '131026: Message undeliverable'))
            ->handle(app(DeliveryAttemptUpdater::class));

        $this->assertSame('failed', $tentative->fresh()->status, 'l\'accusé retrouve la tentative');
        $this->assertCount(0, $this->sms->sentTo(self::PHONE), 'pas de secours SMS sur un échec tardif');
    }

    public function test_un_echec_immediat_est_journalise_et_se_replie_en_sms(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['code' => 131026, 'message' => 'undeliverable']], 400)]);

        $this->envoyer();

        $this->assertSame(1, NotificationDeliveryAttempt::query()->where('provider', 'whatsapp_cloud')->whereNull('app_notification_id')->count());
        $this->assertCount(1, $this->sms->sentTo(self::PHONE));
    }

    private function envoyer(): void
    {
        app(NotificationService::class)->send(
            ContactSansCompte::forPhone(self::PHONE, 'fr'),
            NotificationCode::LeasePaymentOverdue,
            ['amount' => 150000, 'days' => 5, 'due_date' => '2026-10-16', 'property' => 'Villa Ngor'],
        );
    }
}
