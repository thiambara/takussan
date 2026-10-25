<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Notifications\Channels\AgenceDeLEnvoi;
use App\Notifications\CodedNotification;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Carbon;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * P203.01, P203.02 (TCK-2161) — un SMS ou un WhatsApp part par l'intégration de l'agence de
 * l'objet notifié (`docs/features.md`, « Émetteur »), que le destinataire ait un compte ou non :
 * l'appelant la passe à `NotificationService::send()`, et un contact sans compte la porte depuis
 * sa fiche ou sa visite. Un appelant qui ne la passe pas garde l'accesseur du destinataire.
 *
 * Rouge avant le correctif : les canaux lisaient `$notifiable->agency_id`, l'agence du seul profil
 * du compte, et `null` (la plateforme) pour tout contact sans compte.
 */
class AgenceDeLObjetNotifieTest extends TestCase
{
    use RefreshDatabase;

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        $this->sms = FakeSmsRouter::install();
        config(['sms.quiet_hours.enabled' => false]);
    }

    public function test_l_agence_passee_par_l_appelant_l_emporte_sur_l_accesseur_du_compte(): void
    {
        $compteDeA = (object) ['agency_id' => 11];

        $this->assertSame(22, AgenceDeLEnvoi::resolve($compteDeA, $this->notification(agencyId: 22)));
        $this->assertSame(11, AgenceDeLEnvoi::resolve($compteDeA, $this->notification()), 'sans agence passée, l\'accesseur');
    }

    public function test_un_contact_sans_compte_lit_l_agence_sur_sa_route(): void
    {
        $this->assertSame(33, AgenceDeLEnvoi::resolve((new AnonymousNotifiable)->route('sms', '+221770000001')->route('agency', 33), $this->notification()));
        $this->assertNull(AgenceDeLEnvoi::resolve((new AnonymousNotifiable)->route('sms', '+221770000001'), $this->notification()));
    }

    public function test_la_fiche_d_un_contact_sans_compte_porte_son_agence_jusqu_au_routeur(): void
    {
        $agence = Agency::factory()->create();
        $client = Customer::factory()->create(['user_id' => null, 'agency_id' => $agence->id, 'phone' => '+221 77 000 08 11']);

        app(NotificationService::class)->send(ContactSansCompte::fromCustomer($client), NotificationCode::LeasePaymentOverdue, $this->params());

        $this->assertSame($agence->id, $this->agenceVueParLeRouteur('+221770000811'));
    }

    public function test_la_relance_d_un_bail_part_par_l_agence_du_bail(): void
    {
        Carbon::setTestNow('2026-09-30 12:00:00');
        $agenceDuClient = Agency::factory()->create();
        $agenceDuBail = Agency::factory()->create();
        $client = Customer::factory()->create(['user_id' => null, 'agency_id' => $agenceDuClient->id, 'phone' => '+221 77 000 08 12']);
        $lease = Lease::factory()->active()->create(['tenant_id' => $client->id, 'agency_id' => $agenceDuBail->id]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 150000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Late,
            'due_date' => '2026-09-29',
        ]);

        app()->call([new SendLeasePaymentReminders, 'handle']);

        $this->assertSame($agenceDuBail->id, $this->agenceVueParLeRouteur('+221770000812'));
    }

    private function notification(?int $agencyId = null): CodedNotification
    {
        return new CodedNotification(NotificationCode::LeasePaymentOverdue, $this->params(), agencyId: $agencyId);
    }

    /** @return array<string, mixed> */
    private function params(): array
    {
        return ['amount' => 150000, 'days' => 1, 'due_date' => '2026-09-29', 'property' => 'Villa Ngor'];
    }

    private function agenceVueParLeRouteur(string $numero): ?int
    {
        $envois = $this->sms->sentTo($numero);
        $this->assertCount(1, $envois);

        return $envois[0]['context']['agency_id'] ?? null;
    }
}
