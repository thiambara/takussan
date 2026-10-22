<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Events\Payments\LeasePaymentSettledOnline;
use App\Jobs\SendLeasePaymentReminders;
use App\Jobs\SendPropertyVisitReminders;
use App\Listeners\Payments\SendRentReceiptAfterOnlinePayment;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-1493 (P107.01, porteur 2026-10-22) — « sans téléphone vérifié sur le compte, le canal mobile
 * part au contact de la fiche (`ContactSansCompte::fromCustomer` ou `fromVisit`), pour les seuls
 * codes de `reachesContacts()` ».
 *
 * Les canaux mobiles d'un compte s'arrêtent sans `phone_verified_at` : un locataire ou un
 * visiteur qui avait un compte perdait le SMS que le même numéro recevait sans compte.
 */
class RelaisMobileDuCompteTest extends TestCase
{
    use EnvoisParCode, FabriqueDemandesEtVisites, RefreshDatabase;

    private const FICHE = '+221771234567';

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function echeanceEnRetard(?Carbon $verifie): LeasePayment
    {
        Carbon::setTestNow('2026-09-30 08:00:00');
        $user = User::factory()->create(['preferred_language' => 'fr', 'phone_verified_at' => $verifie]);
        $tenant = Customer::factory()->create(['user_id' => $user->id, 'phone' => '+221 77 123 45 67']);
        $lease = Lease::factory()->active()->create(['tenant_id' => $tenant->id]);

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 150000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Late,
            'due_date' => '2026-09-29',
        ]);
    }

    public function test_la_relance_d_un_compte_sans_telephone_verifie_part_aussi_au_numero_de_la_fiche(): void
    {
        $payment = $this->echeanceEnRetard(null);

        app()->call([new SendLeasePaymentReminders, 'handle']);

        $this->assertSame(1, self::nombreDEnvois($payment->lease->tenant->user, NotificationCode::LeasePaymentOverdue));
        $envois = self::envoisALaDemande(NotificationCode::LeasePaymentOverdue);
        $this->assertCount(1, $envois);
        [$notification, , $to] = $envois->first();
        $this->assertSame(self::FICHE, $to->routes['sms']);
        // Le compte n'a pas d'e-mail en double : la fiche est réduite à son numéro.
        $this->assertArrayNotHasKey('mail', $to->routes);
        // VERIF-602 M2 — aucun lien porteur pour un locataire qui a un compte.
        $this->assertArrayNotHasKey('payment_url', $notification->params);
    }

    public function test_un_compte_au_telephone_verifie_ne_declenche_aucun_relais(): void
    {
        $this->echeanceEnRetard(now()->subDay());

        app()->call([new SendLeasePaymentReminders, 'handle']);

        $this->assertCount(0, self::envoisALaDemande(NotificationCode::LeasePaymentOverdue));
    }

    public function test_la_quittance_en_ligne_d_un_compte_sans_telephone_verifie_part_au_numero_de_la_fiche(): void
    {
        $payment = $this->echeanceEnRetard(null);

        app(SendRentReceiptAfterOnlinePayment::class)->handle(new LeasePaymentSettledOnline($payment->id));

        $envois = self::envoisALaDemande(NotificationCode::LeasePaymentSettledOnline);
        $this->assertCount(1, $envois);
        [$notification, , $to] = $envois->first();
        $this->assertSame(self::FICHE, $to->routes['sms']);
        $this->assertArrayNotHasKey('receipt_url', $notification->params);
    }

    private function visiteDe(User $visiteur, string $statut, string $quand): PropertyVisit
    {
        $x = $this->agence();

        return PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($x)->id,
            'visitor_id' => $visiteur->id,
            'visitor_email' => null,
            'visitor_phone' => self::FICHE,
            'scheduled_at' => $quand,
            'status' => $statut,
        ]);
    }

    public function test_le_rappel_de_visite_d_un_compte_sans_telephone_verifie_part_au_numero_de_la_visite(): void
    {
        $visiteur = $this->client(['phone_verified_at' => null]);
        $this->visiteDe($visiteur, VisitStatus::Confirmed->value, now()->addDay()->toDateTimeString());

        (new SendPropertyVisitReminders)->handle();

        $this->assertSame(1, self::nombreDEnvois($visiteur, NotificationCode::VisitReminder));
        $envois = self::envoisALaDemande(NotificationCode::VisitReminder);
        $this->assertCount(1, $envois);
        $this->assertSame(self::FICHE, $envois->first()[2]->routes['sms']);
    }

    public function test_la_confirmation_de_visite_d_un_compte_sans_telephone_verifie_part_au_numero_de_la_visite(): void
    {
        $visiteur = $this->client(['phone_verified_at' => null]);
        $visite = $this->visiteDe($visiteur, VisitStatus::Scheduled->value, $this->creneau());

        $sms = app(VisitNotifier::class)->confirmed($visite);

        $this->assertTrue($sms);
        $this->assertSame(1, self::nombreDEnvois($visiteur, NotificationCode::VisitConfirmed));
        $envois = self::envoisALaDemande(NotificationCode::VisitConfirmed);
        $this->assertCount(1, $envois);
        $this->assertSame(self::FICHE, $envois->first()[2]->routes['sms']);
    }

    public function test_la_confirmation_d_un_visiteur_au_telephone_verifie_ne_part_qu_a_son_compte(): void
    {
        $visiteur = $this->client(['phone_verified_at' => now()->subDay()]);
        $visite = $this->visiteDe($visiteur, VisitStatus::Scheduled->value, $this->creneau());

        app(VisitNotifier::class)->confirmed($visite);

        $this->assertCount(0, self::envoisALaDemande(NotificationCode::VisitConfirmed));
    }
}
