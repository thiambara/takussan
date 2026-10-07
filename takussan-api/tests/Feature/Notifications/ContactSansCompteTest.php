<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Customer;
use App\Models\Integration;
use App\Models\NotificationTemplate;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification as BaseNotification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use LogicException;
use Tests\TestCase;

/**
 * TCK-588, AC3 — un contact sans compte reçoit un message transactionnel, sur WhatsApp s'il y a
 * consenti, sinon par SMS ; jamais au-delà de la limite de son NUMÉRO ; et un destinataire wolof
 * hors fenêtre reçoit le gabarit `fr` approuvé plutôt qu'un SMS.
 *
 * Bout en bout, à travers les vrais canaux : seules les API des prestataires sont simulées.
 */
class ContactSansCompteTest extends TestCase
{
    use RefreshDatabase;

    private string $phone = '+221771234567';

    protected function setUp(): void
    {
        parent::setUp();
        // Un contact sans compte n'a pas d'agence : ce sont les intégrations de la plateforme.
        Integration::create([
            'provider' => 'whatsapp_cloud',
            'agency_id' => null,
            'credentials' => ['phone_number_id' => '123456', 'access_token' => 'tok'],
            'is_active' => true,
        ]);
        Integration::create([
            'provider' => 'sms_lafricamobile',
            'agency_id' => null,
            'credentials' => ['accountid' => 'a', 'password' => 'p', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);
        config()->set('whatsapp.default_driver', 'cloud');
        config()->set('sms.quiet_hours.enabled', false);
        config()->set('sms.webhook_url_token', 'tck-588-test');
        RateLimiter::clear("sms-channel:phone:{$this->phone}");
        RateLimiter::clear("whatsapp-channel:phone:{$this->phone}");
        Http::fake([
            'graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.588']]], 200),
            'lampush*' => Http::response(['push_id' => 'lam-588'], 200),
        ]);
    }

    /** @return array<string, mixed> */
    private function params(): array
    {
        return [
            'amount' => NotificationRenderer::money(150000, 'XOF'),
            'days' => 1,
            'due_date' => '2026-09-29',
            'property' => 'Villa Almadies',
        ];
    }

    private function contact(?Customer $customer = null): ContactSansCompte
    {
        return ContactSansCompte::fromCustomer($customer ?? Customer::factory()->create([
            'user_id' => null,
            'phone' => '+221 77 123 45 67',
        ]));
    }

    private function send(?ContactSansCompte $to = null): void
    {
        app(NotificationService::class)->send($to ?? $this->contact(), NotificationCode::LeasePaymentOverdue, $this->params());
    }

    private function approvedTemplate(string $locale): void
    {
        NotificationTemplate::query()->updateOrCreate(
            ['event' => NotificationCode::LeasePaymentOverdue->value, 'channel' => 'whatsapp', 'locale' => $locale],
            ['body' => 'x', 'is_active' => true, 'meta_template_name' => 'takussan_lease_payment_overdue', 'meta_status' => NotificationTemplate::META_STATUS_APPROVED],
        );
    }

    private function smsSent(): int
    {
        return Http::recorded(fn ($req) => str_contains($req->url(), 'lampush'))->count();
    }

    private function whatsappSent(): int
    {
        return Http::recorded(fn ($req) => str_contains($req->url(), 'graph.facebook.com'))->count();
    }

    public function test_par_defaut_un_sms_fr(): void
    {
        $this->send();

        $this->assertSame(1, $this->smsSent());
        $this->assertSame(0, $this->whatsappSent());
        Http::assertSent(fn ($req) => str_contains($req->url(), 'lampush') && str_contains(json_encode($req->data()), 'en retard de 1 jour'));
    }

    public function test_opted_in_avec_gabarit_approuve_un_whatsapp_et_pas_de_sms(): void
    {
        WhatsappContact::create(['phone' => $this->phone, 'opt_in_status' => WhatsappContact::OPT_IN_OPTED_IN]);
        $this->approvedTemplate('fr');

        $this->send();

        $this->assertSame(1, $this->whatsappSent());
        $this->assertSame(0, $this->smsSent());
        Http::assertSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com') && $req['type'] === 'template');
    }

    public function test_opted_out_un_sms_seul(): void
    {
        WhatsappContact::create(['phone' => $this->phone, 'opt_in_status' => WhatsappContact::OPT_IN_OPTED_OUT]);
        $this->approvedTemplate('fr');

        $this->send();

        $this->assertSame(0, $this->whatsappSent());
        $this->assertSame(1, $this->smsSent());
    }

    public function test_sans_consentement_explicite_pas_de_whatsapp(): void
    {
        WhatsappContact::create(['phone' => $this->phone, 'opt_in_status' => WhatsappContact::OPT_IN_PENDING]);
        $this->approvedTemplate('fr');

        $this->send();

        $this->assertSame(0, $this->whatsappSent());
        $this->assertSame(1, $this->smsSent());
    }

    public function test_sans_telephone_rien_et_sans_exception(): void
    {
        $this->send($this->contact(Customer::factory()->create(['user_id' => null, 'phone' => null])));
        $this->send($this->contact(Customer::factory()->create(['user_id' => null, 'phone' => '77 12'])));

        $this->assertSame(0, $this->smsSent() + $this->whatsappSent());
    }

    public function test_au_dela_de_la_limite_par_numero_rien(): void
    {
        $max = (int) config('sms.rate_limit.per_user_per_hour', 5);

        for ($i = 0; $i < $max + 2; $i++) {
            $this->send();
        }

        $this->assertSame($max, $this->smsSent());
    }

    public function test_un_destinataire_wo_hors_fenetre_recoit_le_gabarit_fr(): void
    {
        $customer = Customer::factory()->create([
            'user_id' => User::factory()->create(['preferred_language' => 'wo'])->id,
            'phone' => $this->phone,
        ]);
        WhatsappContact::create(['phone' => $this->phone, 'opt_in_status' => WhatsappContact::OPT_IN_OPTED_IN, 'last_inbound_at' => now()->subDays(3)]);
        $this->approvedTemplate('fr');

        $contact = ContactSansCompte::fromCustomer($customer);
        $this->assertSame('wo', $contact->locale);
        $this->send($contact);

        $this->assertSame(0, $this->smsSent());
        Http::assertSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com')
            && $req['type'] === 'template'
            && $req['template']['language']['code'] === 'fr');
    }

    /**
     * La garde du CANAL, indépendamment du `via()` de `CodedNotification` : une notification routée
     * par un autre émetteur (les alertes de TCK-599) qui demande WhatsApp à un numéro sans
     * consentement bascule en SMS.
     */
    public function test_le_canal_whatsapp_exige_le_consentement_d_un_destinataire_route(): void
    {
        WhatsappContact::create(['phone' => $this->phone, 'opt_in_status' => WhatsappContact::OPT_IN_PENDING, 'last_inbound_at' => now()]);

        Notification::route('whatsapp', $this->phone)->route('sms', $this->phone)->notify(new class extends BaseNotification implements SupportsSms, SupportsWhatsapp
        {
            public function via(object $notifiable): array
            {
                return ['whatsapp'];
            }

            public function toSms(object $notifiable): string
            {
                return 'sms';
            }

            public function shouldSendSms(): bool
            {
                return true;
            }

            public function isCriticalSms(): bool
            {
                return false;
            }

            public function toWhatsapp(object $notifiable): string
            {
                return 'wa';
            }

            public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef
            {
                return null;
            }

            public function shouldSendWhatsapp(): bool
            {
                return true;
            }

            public function isCriticalWhatsapp(): bool
            {
                return false;
            }
        });

        $this->assertSame(0, $this->whatsappSent());
        $this->assertSame(1, $this->smsSent());
    }

    public function test_un_code_non_transactionnel_ne_vise_jamais_un_contact(): void
    {
        $this->expectException(LogicException::class);

        app(NotificationService::class)->send($this->contact(), NotificationCode::BookingConfirmed, []);
    }
}
