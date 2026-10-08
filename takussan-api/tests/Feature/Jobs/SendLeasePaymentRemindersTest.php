<?php

namespace Tests\Feature\Jobs;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Formatting\CurrencyFormatter;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-588 — relances de loyer : jours justes, solde formaté dans la langue du destinataire,
 * locataire sans compte, bailleur et récapitulatif d'agent, et un retard relancé sans pénalité.
 *
 * L'ancien test mockait `notify()->once()` sans regarder le texte : il est resté vert pendant
 * que le locataire lisait « en retard de -7.33 jour(s) ».
 */
class SendLeasePaymentRemindersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function run_(): void
    {
        app()->call([new SendLeasePaymentReminders, 'handle']);
    }

    /**
     * @param  array<string, mixed>  $payment
     * @param  array<string, mixed>  $lease
     */
    private function payment(array $payment = [], ?Customer $tenant = null, array $lease = []): LeasePayment
    {
        $tenant ??= Customer::factory()->create([
            'user_id' => User::factory()->create(['preferred_language' => 'fr'])->id,
        ]);
        $leaseModel = Lease::factory()->active()->create($lease + ['tenant_id' => $tenant->id]);

        return LeasePayment::factory()->create($payment + [
            'lease_id' => $leaseModel->id,
            'amount' => 150000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Late,
        ]);
    }

    private function inLocale(string $locale, \Closure $callback): mixed
    {
        $previous = app()->getLocale();
        app()->setLocale($locale);
        try {
            return $callback();
        } finally {
            app()->setLocale($previous);
        }
    }

    private function fcfa(float $amount, string $locale = 'fr'): string
    {
        return app(CurrencyFormatter::class)->format($amount, Currency::XOF, $locale);
    }

    /** @return Collection<int, AppNotification> */
    private function rows(User $user, ?NotificationCode $code = null)
    {
        return AppNotification::query()
            ->where('user_id', $user->id)
            ->when($code, fn ($q) => $q->where('code', $code->value))
            ->get();
    }

    // ─── AC1 — jours et montant ─────────────────────────────────────────────────────────

    public function test_ac1_le_retard_annonce_des_jours_entiers_et_un_montant_lisible(): void
    {
        Carbon::setTestNow('2026-10-06 08:00:00');
        $payment = $this->payment(['due_date' => '2026-09-29']);
        $tenant = $payment->lease->tenant->user;

        $this->run_();

        $row = $this->rows($tenant, NotificationCode::LeasePaymentOverdue)->sole();
        $title = $payment->lease->property->title;
        $this->assertSame(
            "Votre loyer de {$this->fcfa(150000)} pour {$title}, dû le 29 septembre 2026, est en retard de 7 jours.",
            $row->body,
        );
        $this->assertStringNotContainsString('150000.00', $row->body);
        $this->assertStringNotContainsString('XOF', $row->body);
        $this->assertSame(7, $row->params['days']);
        $this->assertSame("/app/leases/{$payment->lease_id}", $row->target['path']);
    }

    public function test_ac1_a_j_plus_1_il_dit_un_jour(): void
    {
        Carbon::setTestNow('2026-09-30 08:00:00');
        $payment = $this->payment(['due_date' => '2026-09-29']);

        $this->run_();

        $row = $this->rows($payment->lease->tenant->user, NotificationCode::LeasePaymentOverdue)->sole();
        $this->assertStringContainsString('en retard de 1 jour.', $row->body);
    }

    // ─── AC3 — locataire sans compte ────────────────────────────────────────────────────

    public function test_ac3_un_locataire_sans_compte_recoit_un_sms_et_aucune_ligne(): void
    {
        Carbon::setTestNow('2026-09-30 08:00:00');
        $tenant = Customer::factory()->create(['user_id' => null, 'phone' => '+221 77 123 45 67']);
        $this->payment(['due_date' => '2026-09-29'], $tenant);

        $this->run_();

        Notification::assertSentOnDemandTimes(CodedNotification::class, 1);
        Notification::assertSentOnDemand(CodedNotification::class, function (CodedNotification $n, array $channels, AnonymousNotifiable $to, ?string $locale) {
            return $n->code === NotificationCode::LeasePaymentOverdue
                && $channels === ['sms']
                && $to->routes['sms'] === '+221771234567'
                && $locale === 'fr'
                && str_contains($this->inLocale($locale, fn () => $n->toSms($to)), 'en retard de 1 jour');
        });
        // Le locataire n'a pas de ligne (`user_id` vise `users`) ; le bailleur, lui, en a une.
        $this->assertSame(0, AppNotification::query()->where('code', NotificationCode::LeasePaymentOverdue->value)->count());
    }

    public function test_ac3_sans_telephone_rien_ne_part_et_rien_ne_leve(): void
    {
        Carbon::setTestNow('2026-09-30 08:00:00');
        $tenant = Customer::factory()->create(['user_id' => null, 'phone' => null]);
        $this->payment(['due_date' => '2026-09-29'], $tenant);

        $this->run_();

        Notification::assertSentOnDemandTimes(CodedNotification::class, 0);
        $this->assertSame(0, AppNotification::query()->where('code', 'lease_payment.overdue')->count());
    }

    // ─── AC4 — bailleur et agent ────────────────────────────────────────────────────────

    public function test_ac4_bailleurs_et_un_seul_recapitulatif_par_agent_isole_par_agence(): void
    {
        Carbon::setTestNow('2026-09-30 08:00:00');
        $agency = Agency::factory()->create();
        $agent = User::factory()->create();
        $idleAgent = User::factory()->create();
        $otherAgent = User::factory()->create();

        $landlords = [User::factory()->create(), User::factory()->create()];
        $properties = [];
        foreach ($landlords as $landlord) {
            $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id]);
            PropertyCollaborator::create(['property_id' => $property->id, 'user_id' => $agent->id, 'role' => CollaboratorRole::Agent->value, 'invited_at' => now()]);
            $properties[] = $property;
        }
        // Un bien sans retard pour l'agent inactif.
        $quiet = Property::factory()->create(['agency_id' => $agency->id]);
        PropertyCollaborator::create(['property_id' => $quiet->id, 'user_id' => $idleAgent->id, 'role' => CollaboratorRole::Agent->value, 'invited_at' => now()]);

        // Trois retards sur deux baux du même agent.
        $lease1 = $this->payment(['due_date' => '2026-09-29'], null, ['property_id' => $properties[0]->id, 'landlord_id' => $landlords[0]->id])->lease;
        LeasePayment::factory()->create(['lease_id' => $lease1->id, 'amount' => 100000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-09-29']);
        $this->payment(['due_date' => '2026-09-23'], null, ['property_id' => $properties[1]->id, 'landlord_id' => $landlords[1]->id]);

        // Un retard dans une autre agence.
        $elsewhere = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        PropertyCollaborator::create(['property_id' => $elsewhere->id, 'user_id' => $otherAgent->id, 'role' => CollaboratorRole::Agent->value, 'invited_at' => now()]);
        $this->payment(['due_date' => '2026-09-29'], null, ['property_id' => $elsewhere->id]);

        $this->run_();

        foreach ($landlords as $i => $landlord) {
            $rows = $this->rows($landlord, NotificationCode::LeasePaymentOverdueLandlord);
            $this->assertNotEmpty($rows);
            $this->assertSame($properties[$i]->title, $rows->first()->params['property']);
            $this->assertStringContainsString($properties[$i]->title, $rows->first()->body);
            $this->assertNotSame('', trim((string) $rows->first()->params['tenant']));
        }

        $digest = $this->rows($agent, NotificationCode::LeasePaymentOverdueDigest)->sole();
        $this->assertSame(3, $digest->params['count']);
        $this->assertSame('400000.00', $digest->params['total']['amount']);
        $this->assertSame('/app/payments', $digest->target['path']);

        $this->assertSame(1, $this->rows($otherAgent, NotificationCode::LeasePaymentOverdueDigest)->sole()->params['count']);
        $this->assertCount(0, $this->rows($idleAgent));

        // Relancer le job le même jour n'envoie rien de plus.
        $before = AppNotification::query()->count();
        $this->run_();
        $this->assertSame($before, AppNotification::query()->count());
    }

    // ─── AC15 — un retard est relancé sans pénalité ─────────────────────────────────────

    public function test_ac15_un_bail_sans_penalite_est_relance(): void
    {
        Carbon::setTestNow('2026-09-30 08:00:00');
        $payment = $this->payment(['due_date' => '2026-09-29', 'status' => PaymentStatus::Pending], null, ['late_fee_percent' => null]);

        $this->run_();

        $this->assertCount(1, $this->rows($payment->lease->tenant->user, NotificationCode::LeasePaymentOverdue));
    }

    public function test_ac15_un_bail_a_delai_de_grace_est_relance_a_j_plus_1(): void
    {
        Carbon::setTestNow('2026-09-30 08:00:00');
        $payment = $this->payment(['due_date' => '2026-09-29', 'status' => PaymentStatus::Pending], null, ['late_fee_percent' => 5, 'late_fee_grace_days' => 3]);

        $this->run_();

        $this->assertCount(1, $this->rows($payment->lease->tenant->user, NotificationCode::LeasePaymentOverdue));
    }

    public function test_ac15_une_echeance_partiellement_payee_annonce_son_solde(): void
    {
        Carbon::setTestNow('2026-09-26 08:00:00');
        $payment = $this->payment([
            'due_date' => '2026-09-29',
            'status' => PaymentStatus::PartiallyPaid,
            'metadata' => ['paid_amount' => 100000],
        ]);

        $this->run_();

        $row = $this->rows($payment->lease->tenant->user, NotificationCode::LeasePaymentDueSoon)->sole();
        $this->assertSame('50000.00', $row->params['amount']['amount']);
        $this->assertStringContainsString($this->fcfa(50000), $row->body);
    }

    public function test_ac15_une_echeance_payee_ou_remboursee_n_est_pas_relancee(): void
    {
        Carbon::setTestNow('2026-09-30 08:00:00');
        $paid = $this->payment(['due_date' => '2026-09-29', 'status' => PaymentStatus::Paid]);
        $refunded = $this->payment(['due_date' => '2026-09-29', 'status' => PaymentStatus::Refunded]);

        $this->run_();

        foreach ([$paid, $refunded] as $payment) {
            $this->assertCount(0, $this->rows($payment->lease->tenant->user)->whereIn('code', [
                NotificationCode::LeasePaymentOverdue->value,
                NotificationCode::LeasePaymentDueSoon->value,
            ]));
        }
    }

    public function test_le_rappel_j_moins_3_part_une_seule_fois(): void
    {
        Carbon::setTestNow('2026-09-26 08:00:00');
        $payment = $this->payment(['due_date' => '2026-09-29', 'status' => PaymentStatus::Pending]);

        $this->run_();
        $this->run_();

        $this->assertCount(1, $this->rows($payment->lease->tenant->user, NotificationCode::LeasePaymentDueSoon));
    }
}
