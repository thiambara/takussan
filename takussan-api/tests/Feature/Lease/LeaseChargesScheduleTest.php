<?php

namespace Tests\Feature\Lease;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\GenerateLeasePaymentSchedule;
use App\Jobs\Lease\ApplyLateFeesJob;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Lease\LateFeeCalculator;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Model\LeaseService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2679 (ADR-0042, amendement du 2026-11-10 ; ADR-0100 § 6) — les charges du bail sont un terme
 * imprimé au contrat, appelé par l'échéancier à côté du loyer.
 *
 * Avant : `leases` n'avait aucune colonne de charges, l'échéancier n'écrivait que des loyers (et la
 * caution), et la seule échéance `charges` possible était saisie à la main. Le locataire lisait des
 * charges sur l'annonce, jamais sur son contrat ni dans ce qu'il doit.
 *
 * Ce qui suit le loyer : l'échéancier, la sortie anticipée, le renouvellement, les relances. Ce qui
 * ne le suit pas : la pénalité de retard, la révision du loyer.
 */
class LeaseChargesScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @param  array<string, mixed>  $attributes */
    private function lease(array $attributes = []): Lease
    {
        $landlord = User::factory()->create();

        return Lease::factory()->create($attributes + [
            'property_id' => Property::factory()->create(['user_id' => $landlord->id])->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create(['user_id' => User::factory()->create(['preferred_language' => 'fr'])->id])->id,
            'status' => LeaseStatus::Active,
            'currency' => Currency::XOF,
            'start_date' => '2027-01-01',
            'end_date' => '2027-12-31',
            'monthly_rent' => 500_000,
            'monthly_charges' => 150_000,
            'deposit_amount' => null,
            'payment_frequency' => PaymentFrequency::Monthly,
            'payment_day' => 1,
        ]);
    }

    /** @return Collection<int, LeasePayment> */
    private function dues(Lease $lease, LeasePaymentType $type): Collection
    {
        return LeasePayment::query()->where('lease_id', $lease->id)
            ->where('payment_type', $type->value)
            ->orderBy('due_date')
            ->get();
    }

    // ── L'échéancier ──────────────────────────────────────────────────────────────────────────

    public function test_un_bail_mensuel_a_charges_recoit_une_echeance_de_charges_par_loyer(): void
    {
        $lease = $this->lease();

        app(LeaseService::class)->generateSchedule($lease);

        $rents = $this->dues($lease, LeasePaymentType::Rent);
        $charges = $this->dues($lease, LeasePaymentType::Charges);
        $this->assertCount(12, $rents);
        $this->assertCount(12, $charges);
        foreach ($rents as $i => $rent) {
            $charge = $charges[$i];
            $this->assertSame(150000.0, (float) $charge->amount);
            $this->assertSame($rent->due_date->toDateString(), $charge->due_date->toDateString());
            $this->assertSame($rent->period_start->toDateString(), $charge->period_start->toDateString());
            $this->assertSame($rent->period_end->toDateString(), $charge->period_end->toDateString());
            $this->assertSame($lease->tenant_id, $charge->payer_id);
            $this->assertSame(PaymentStatus::Pending, $charge->status);
            $this->assertSame('XOF', $charge->currency->value ?? $charge->currency);
            $this->assertNotSame($rent->reference_number, $charge->reference_number);
        }
        $this->assertSame(500000.0, (float) $rents[0]->amount, 'le loyer reste le loyer, sans les charges');
    }

    public function test_un_bail_trimestriel_appelle_trois_mois_de_charges_par_echeance(): void
    {
        $lease = $this->lease(['payment_frequency' => PaymentFrequency::Quarterly]);

        app(LeaseService::class)->generateSchedule($lease);

        $charges = $this->dues($lease, LeasePaymentType::Charges);
        $this->assertCount(4, $charges);
        $this->assertSame([450000.0], $charges->map(fn (LeasePayment $p) => (float) $p->amount)->unique()->values()->all());
    }

    public function test_sans_charges_aucune_echeance_de_charges(): void
    {
        foreach ([null, 0] as $value) {
            $lease = $this->lease(['monthly_charges' => $value]);

            app(LeaseService::class)->generateSchedule($lease);

            $this->assertCount(12, $this->dues($lease, LeasePaymentType::Rent), var_export($value, true));
            $this->assertCount(0, $this->dues($lease, LeasePaymentType::Charges), var_export($value, true));
        }
    }

    /**
     * Une échéance de charges SAISIE à la main (régularisation) ne fait pas taire l'échéancier — le
     * contrôle « déjà émis » reste sur le loyer, comme la caution depuis TCK-957 — mais sa période
     * n'est pas appelée une seconde fois.
     */
    public function test_des_charges_saisies_a_la_main_ne_font_pas_taire_l_echeancier_ni_ne_sont_doublees(): void
    {
        $lease = $this->lease();
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payment_type' => LeasePaymentType::Charges->value,
            'amount' => 150_000,
            'status' => PaymentStatus::Pending,
            'due_date' => '2027-01-01',
            'period_start' => '2027-01-01',
            'period_end' => '2027-01-31',
        ]);

        app(LeaseService::class)->generateScheduleIfMissing($lease);

        $this->assertCount(12, $this->dues($lease, LeasePaymentType::Rent));
        $charges = $this->dues($lease, LeasePaymentType::Charges);
        $this->assertCount(12, $charges);
        $this->assertCount(12, $charges->unique(fn (LeasePayment $p) => $p->period_start->toDateString()));
    }

    /** Des loyers annulés un à un puis un échéancier régénéré : les charges encore vivantes ne doublent pas. */
    public function test_une_regeneration_apres_des_loyers_annules_ne_double_pas_les_charges(): void
    {
        $lease = $this->lease();
        app(LeaseService::class)->generateSchedule($lease);
        LeasePayment::query()->where('lease_id', $lease->id)->where('payment_type', LeasePaymentType::Rent->value)
            ->update(['status' => PaymentStatus::Cancelled->value]);

        app(LeaseService::class)->generateSchedule($lease->fresh());

        $this->assertCount(12, $this->dues($lease, LeasePaymentType::Rent)->where('status', PaymentStatus::Pending));
        $this->assertCount(12, $this->dues($lease, LeasePaymentType::Charges));
    }

    /** AC1 — par l'API : créé avec ses charges, activé, il rend 12 loyers, 12 charges et la caution. */
    public function test_ac1_le_bail_cree_avec_charges_puis_active_les_rend_dans_ses_paiements(): void
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create(['added_by_id' => $landlord->id]);
        $start = now()->addMonth()->startOfMonth();
        Sanctum::actingAs($landlord);

        $id = $this->postJson('/api/leases', [
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'type' => 'residential_rent',
            'start_date' => $start->toDateString(),
            'end_date' => $start->copy()->addYear()->subDay()->toDateString(),
            'monthly_rent' => 500_000,
            'monthly_charges' => 150_000,
            'deposit_amount' => 1_000_000,
            'payment_frequency' => 'monthly',
            'payment_day' => 1,
        ])->assertCreated()
            ->assertJsonPath('data.monthly_charges', 150000)
            ->json('data.id');

        $lease = Lease::query()->findOrFail($id);
        $this->assertSame('150000.00', $lease->getRawOriginal('monthly_charges'));
        app(LeaseService::class)->activate($lease);

        $rows = collect($this->getJson("/api/leases/{$id}/payments?per_page=100")->assertOk()->json('data'));
        $this->assertCount(12, $rows->where('payment_type', 'rent'));
        $this->assertCount(12, $rows->where('payment_type', 'charges'));
        $this->assertCount(1, $rows->where('payment_type', 'deposit'));
        $rentDates = $rows->where('payment_type', 'rent')->pluck('due_date')->sort()->values()->all();
        $this->assertSame($rentDates, $rows->where('payment_type', 'charges')->pluck('due_date')->sort()->values()->all());
        $this->assertSame([150000.0], $rows->where('payment_type', 'charges')->map(fn ($r) => (float) $r['amount'])->unique()->values()->all());
    }

    // ── Le contrat ────────────────────────────────────────────────────────────────────────────

    private function contract(Lease $lease): string
    {
        $lease->load(['property.address', 'tenant', 'landlord', 'agency', 'guarantors']);

        return html_entity_decode(view('pdf.leases.contract', [
            'title' => 'Contrat de bail', 'document_label' => 'Bail', 'lease' => $lease,
            'tenant' => $lease->tenant, 'landlord' => $lease->landlord, 'property' => $lease->property,
            'agency' => $lease->agency, 'guarantors' => $lease->guarantors,
        ])->render(), ENT_QUOTES);
    }

    /** AC2 — la ligne est imprimée quand les charges sont posées, et seulement alors. */
    public function test_ac2_le_contrat_imprime_les_charges_seulement_quand_elles_sont_posees(): void
    {
        $html = $this->contract($this->lease());
        $this->assertStringContainsString('Charges mensuelles', $html);
        $this->assertMatchesRegularExpression('/150\s000/u', $html);

        $this->assertStringNotContainsString('Charges mensuelles', $this->contract($this->lease(['monthly_charges' => null])));
        $this->assertStringNotContainsString('Charges mensuelles', $this->contract($this->lease(['monthly_charges' => 0])));
    }

    /** Un bail en attente de signature dont la signature a été demandée : contrat figé. */
    private function frozenLease(array $attributes = []): Lease
    {
        $this->mock(DocumentPdfService::class, function ($mock): void {
            $mock->shouldReceive('render')->andReturnUsing(
                fn (string $template, array $data) => (string) preg_replace('/Document généré le [^<]*/u', '', view($template, $data)->render())
            );
        });
        $lease = $this->lease($attributes + [
            'status' => LeaseStatus::Draft,
            'start_date' => now()->subMonth()->toDateString(),
            'end_date' => now()->addYears(2)->toDateString(),
        ]);
        app(LeaseSignatureService::class)->request($lease, $lease->landlord);

        return $lease->fresh();
    }

    /**
     * AC3 — un bail signé avant la migration (colonne absente, donc nulle ensuite) garde son contrat
     * figé : la migration ne touche aucune ligne, et le document figé n'imprime aucune charge.
     */
    public function test_ac3_la_migration_ne_change_ni_l_empreinte_ni_le_document_d_un_contrat_fige(): void
    {
        $lease = $this->frozenLease(['monthly_charges' => null]);
        $sha = $lease->contract_sha256;
        $this->assertNotNull($sha);
        $this->assertStringNotContainsString('Charges', (string) $lease->frozenContractBytes());

        $migration = require database_path('migrations/2026_11_11_120000_add_monthly_charges_to_leases_table.php');
        $migration->down();
        $migration->up();

        $fresh = $lease->fresh();
        $this->assertSame($sha, $fresh->contract_sha256);
        $this->assertNull($fresh->monthly_charges);
        $this->assertNotNull($fresh->frozenContractBytes(), 'le document figé a toujours son empreinte : ses signatures comptent');
    }

    // ── Terme imprimé : figé à la signature ───────────────────────────────────────────────────

    public function test_les_charges_d_un_bail_signe_ne_se_modifient_plus(): void
    {
        $lease = $this->lease();
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['monthly_charges' => 10_000])
            ->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');
        $this->assertSame(150000.0, (float) $lease->fresh()->monthly_charges);
    }

    public function test_les_charges_d_un_bail_en_attente_se_modifient_et_defigent_le_contrat(): void
    {
        $lease = $this->frozenLease();
        $this->assertSame(LeaseStatus::PendingSignature, $lease->status);
        $this->assertNotNull($lease->contract_sha256);
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['monthly_charges' => 90_000])
            ->assertOk()->assertJsonPath('data.monthly_charges', 90000);

        $fresh = $lease->fresh();
        $this->assertSame(90000.0, (float) $fresh->monthly_charges);
        $this->assertNull($fresh->contract_sha256, 'le contrat signé imprimait 150 000 : il est défigé');
    }

    // ── Ce qui ne suit pas le loyer : la pénalité de retard ────────────────────────────────────

    /** AC4 — en retard de 10 jours sur un bail à 5 % : le loyer est pénalisé, ses charges non. */
    public function test_ac4_une_echeance_de_charges_en_retard_ne_recoit_aucune_penalite(): void
    {
        Carbon::setTestNow('2027-03-11 10:00:00');
        $lease = $this->lease(['late_fee_percent' => 5, 'late_fee_grace_days' => 0]);
        app(LeaseService::class)->generateSchedule($lease);

        (new ApplyLateFeesJob)->handle(app(LateFeeCalculator::class));

        $rent = $this->dues($lease, LeasePaymentType::Rent)->first(fn (LeasePayment $p) => $p->due_date->toDateString() === '2027-03-01');
        $charge = $this->dues($lease, LeasePaymentType::Charges)->first(fn (LeasePayment $p) => $p->due_date->toDateString() === '2027-03-01');
        $this->assertGreaterThan(0, (float) $rent->late_fee_amount);
        $this->assertSame(0.0, (float) $charge->late_fee_amount);
        $this->assertNull($charge->late_fee_applied_at);
    }

    // ── Ce qui suit le loyer : la sortie, le renouvellement, les relances ──────────────────────

    public function test_a_la_sortie_les_charges_posterieures_s_annulent_comme_les_loyers(): void
    {
        Carbon::setTestNow('2027-04-20 10:00:00');
        $lease = $this->lease();
        app(LeaseService::class)->generateSchedule($lease);

        app(LeaseService::class)->terminate($lease->fresh(), $lease->landlord, 'départ');

        $charges = $this->dues($lease, LeasePaymentType::Charges)->keyBy(fn (LeasePayment $p) => $p->period_start->toDateString());
        foreach (['2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01'] as $start) {
            $this->assertSame(PaymentStatus::Pending, $charges[$start]->status, $start);
        }
        foreach (['2027-05-01', '2027-08-01', '2027-12-01'] as $start) {
            $this->assertSame(PaymentStatus::Cancelled, $charges[$start]->status, $start);
        }
        $this->assertSame(8, $charges->where('status', PaymentStatus::Cancelled)->count());
        $this->assertSame(8, $this->dues($lease, LeasePaymentType::Rent)->where('status', PaymentStatus::Cancelled)->count());
        $this->assertCount(16, Activity::query()->where('event', 'lease_termination_schedule_cancelled')->sole()->properties['cancelled']);
    }

    public function test_le_renouvellement_reprend_les_charges_et_annule_celles_du_parent_qu_il_refacture(): void
    {
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        Carbon::setTestNow('2027-04-20 10:00:00');
        $parent = $this->lease();
        app(LeaseService::class)->generateSchedule($parent);
        Sanctum::actingAs($parent->landlord);

        $this->postJson("/api/leases/{$parent->id}/renew", ['start_date' => '2027-06-01', 'end_date' => '2028-05-31'])
            ->assertCreated();

        $child = Lease::query()->where('renewed_from_lease_id', $parent->id)->sole();
        $this->assertSame(LeaseStatus::Active, $child->status);
        $this->assertSame(150000.0, (float) $child->monthly_charges);

        $open = fn (Lease $l) => $this->dues($l, LeasePaymentType::Charges)
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->map(fn (LeasePayment $p) => $p->due_date->format('Y-m'))->values()->all();
        $this->assertSame(['2027-01', '2027-02', '2027-03', '2027-04', '2027-05'], $open($parent));

        (new GenerateLeasePaymentSchedule($child->fresh()))->handle(app(LeaseService::class));
        $this->assertSame([], array_values(array_intersect($open($parent), $open($child))), 'aucun mois de charges appelé deux fois');
        $this->assertCount(12, $open($child));
    }

    /** Renégocier les charges d'un bail signé est un avenant : l'enfant attend sa signature. */
    public function test_renegocier_les_charges_d_un_contrat_signe_demande_une_signature(): void
    {
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        Carbon::setTestNow('2027-04-20 10:00:00');
        $parent = $this->lease(['early_termination_penalty_months' => 2, 'rent_review_max_pct' => 10]);
        Sanctum::actingAs($parent->landlord);

        $this->postJson("/api/leases/{$parent->id}/renew", ['start_date' => '2028-01-01', 'end_date' => '2028-12-31', 'monthly_charges' => 200_000])
            ->assertCreated();

        $child = Lease::query()->where('renewed_from_lease_id', $parent->id)->sole();
        $this->assertSame(LeaseStatus::PendingSignature, $child->status);
        $this->assertSame(200000.0, (float) $child->monthly_charges);
        $changes = Activity::query()->where('event', 'lease_renewed')->sole()->properties['changes'];
        $this->assertSame(200000.0, (float) $changes['monthly_charges']['to']);
        $this->assertSame(150000.0, (float) $changes['monthly_charges']['from']);
    }

    private function fcfa(float $amount): string
    {
        return app(CurrencyFormatter::class)->format($amount, Currency::XOF, 'fr');
    }

    /** Loyer et charges de même date : UNE relance au locataire, pour leur solde cumulé. */
    public function test_loyer_et_charges_de_meme_date_partent_dans_une_seule_relance(): void
    {
        Carbon::setTestNow('2027-03-02 08:00:00');
        $lease = $this->lease();
        app(LeaseService::class)->generateSchedule($lease);
        $tenant = $lease->tenant->user;

        app()->call([new SendLeasePaymentReminders, 'handle']);

        $rows = AppNotification::query()->where('user_id', $tenant->id)
            ->where('code', NotificationCode::LeasePaymentOverdue->value)->get();
        $this->assertCount(1, $rows);
        $this->assertStringContainsString($this->fcfa(650000), $rows->sole()->body);
        $landlordRows = AppNotification::query()->where('user_id', $lease->landlord_id)
            ->where('code', NotificationCode::LeasePaymentOverdueLandlord->value)->get();
        $this->assertCount(1, $landlordRows);

        // Les deux échéances sont marquées : un second passage n'envoie rien.
        app()->call([new SendLeasePaymentReminders, 'handle']);
        $this->assertSame(1, AppNotification::query()->where('user_id', $tenant->id)
            ->where('code', NotificationCode::LeasePaymentOverdue->value)->count());
    }

    /** Une échéance de charges seule (le loyer réglé) se relance comme un loyer. */
    public function test_une_echeance_de_charges_impayee_seule_se_relance(): void
    {
        Carbon::setTestNow('2027-03-02 08:00:00');
        $lease = $this->lease();
        app(LeaseService::class)->generateSchedule($lease);
        $this->dues($lease, LeasePaymentType::Rent)
            ->first(fn (LeasePayment $p) => $p->due_date->toDateString() === '2027-03-01')
            ->forceFill(['status' => PaymentStatus::Paid])->saveQuietly();

        app()->call([new SendLeasePaymentReminders, 'handle']);

        $row = AppNotification::query()->where('user_id', $lease->tenant->user->id)
            ->where('code', NotificationCode::LeasePaymentOverdue->value)->sole();
        $this->assertStringContainsString($this->fcfa(150000), $row->body);
    }
}
