<?php

namespace Tests\Feature\Api;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\SettingScope;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Lease\RentReviewService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-596 (VERIF-596 M2, ADR-0042 §1) — le contrat signé imprime ce que le bail exécute.
 *
 * Avant : `pdf.leases.contract` n'imprimait ni la pénalité de retard (taux, délai de grâce), ni
 * `special_conditions`, ni le préavis — que `ApplyLateFeesJob` et `EarlyTerminationService`
 * appliquent après activation. Le locataire consentait par code à un document muet, et le faux
 * rendu des tests de signature imprimait `late_fee_percent` à la place du vrai gabarit. Ici, la
 * VRAIE vue est rendue (sans le pied de page horodaté), colonne par colonne.
 */
class LeaseContractTermsTest extends TestCase
{
    use RefreshDatabase;

    /** Deux valeurs par terme imprimé : le rendu doit différer de l'une à l'autre. */
    private const VARIANTS = [
        'type' => ['residential_rent', 'commercial_rent'],
        'start_date' => ['2026-01-01', '2026-02-01'],
        'end_date' => ['2027-01-01', '2027-06-30'],
        'renewal_date' => [null, '2026-12-01'],
        'monthly_rent' => [400_000, 450_000],
        'sale_price' => [null, 50_000_000],
        'currency' => ['XOF', 'EUR'],
        'deposit_amount' => [800_000, 900_000],
        'payment_frequency' => ['monthly', 'quarterly'],
        'payment_day' => [5, 10],
        'late_fee_percent' => [5, 7.5],
        'late_fee_grace_days' => [3, 0],
        'notice_period_days' => [30, 60],
        'early_termination_penalty_months' => [2, 4],
        'rent_review_max_pct' => [20, 7.5],
        'terms' => ['Clauses générales A.', 'Clauses générales B.'],
        'special_conditions' => ['AUCUN ANIMAL', 'TOUT AUTRE CHOSE'],
    ];

    private function lease(array $attributes = []): Lease
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);

        return Lease::factory()->create($attributes + [
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create()->id,
        ]);
    }

    private function render(Lease $lease): string
    {
        $lease->load(['property.address', 'tenant', 'landlord', 'agency', 'guarantors']);

        $html = view('pdf.leases.contract', [
            'title' => 'Contrat de bail',
            'document_label' => 'Bail',
            'lease' => $lease,
            'tenant' => $lease->tenant,
            'landlord' => $lease->landlord,
            'property' => $lease->property,
            'agency' => $lease->agency,
            'guarantors' => $lease->guarantors,
        ])->render();

        return (string) preg_replace('/Document généré le [^<]*/u', '', $html);
    }

    /** Chaque colonne remplissable choisit son camp : imprimée, ou non imprimée pour une raison écrite. */
    public function test_every_fillable_column_is_either_printed_or_excluded_with_a_reason(): void
    {
        $fillable = (new Lease)->getFillable();
        $printed = Lease::CONTRACT_PRINTED_TERMS;
        $unprinted = array_keys(Lease::CONTRACT_UNPRINTED_COLUMNS);

        $this->assertSame([], array_values(array_intersect($printed, $unprinted)), 'une colonne ne peut être des deux camps');
        $this->assertEqualsCanonicalizing($fillable, [...$printed, ...$unprinted]);
        $this->assertEqualsCanonicalizing($printed, array_keys(self::VARIANTS), 'chaque terme imprimé a ses deux valeurs ici');
    }

    /** Le rendu change quand UN terme imprimé change : il est donc bien dans le document signé. */
    public function test_each_printed_term_changes_the_rendered_contract(): void
    {
        $lease = $this->lease();
        $missing = [];

        foreach (self::VARIANTS as $column => [$a, $b]) {
            $lease->forceFill([$column => $a])->saveQuietly();
            $first = $this->render($lease->fresh());
            $lease->forceFill([$column => $b])->saveQuietly();
            $second = $this->render($lease->fresh());
            if ($first === $second) {
                $missing[] = $column;
            }
            $lease->forceFill([$column => $a])->saveQuietly();
        }

        $this->assertSame([], $missing, 'termes exécutés absents du contrat imprimé');
    }

    public function test_the_contract_prints_the_late_fee_and_the_special_conditions(): void
    {
        $html = $this->render($this->lease([
            'late_fee_percent' => 5, 'late_fee_grace_days' => 3, 'special_conditions' => 'AUCUN ANIMAL',
        ]));

        $this->assertStringContainsString('5 % de l\'échéance impayée', html_entity_decode($html, ENT_QUOTES));
        $this->assertStringContainsString('3 jour(s)', $html);
        $this->assertStringContainsString('AUCUN ANIMAL', $html);
    }

    /**
     * Second chemin (hors diff, fermé ici) : `PATCH` changeait la pénalité d'un bail ACTIF — la
     * pénalité exécutée n'était plus celle consentie.
     */
    public function test_a_signed_lease_terms_cannot_be_patched(): void
    {
        $lease = $this->lease(['status' => LeaseStatus::Active, 'late_fee_percent' => 5, 'late_fee_grace_days' => 3]);
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['late_fee_percent' => 50])
            ->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');
        $this->patchJson("/api/leases/{$lease->id}", ['late_fee_grace_days' => 0])
            ->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');

        $fresh = $lease->fresh();
        $this->assertEquals(5, (float) $fresh->late_fee_percent);
        $this->assertSame(3, (int) $fresh->late_fee_grace_days);
    }

    public function test_a_draft_lease_terms_can_still_be_patched(): void
    {
        $lease = $this->lease(['late_fee_percent' => 5]);
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['late_fee_percent' => 7])->assertOk();
        $this->assertEquals(7, (float) $lease->fresh()->late_fee_percent);
    }

    // ── VERIF-596 passe 2 (N1) — les termes exécutés hors colonne sont figés avec le contrat ───────

    private function setting(string $key, int|float $value): void
    {
        Setting::query()->updateOrCreate(['key' => $key], ['value' => $value, 'scope' => SettingScope::Global]);
    }

    /** Un bail en brouillon, signable par code : son locataire a un compte. */
    private function signableLease(array $attributes = []): Lease
    {
        Notification::fake();
        $this->mock(DocumentPdfService::class, function ($mock): void {
            $mock->shouldReceive('render')->andReturnUsing(
                fn (string $template, array $data) => (string) preg_replace('/Document généré le [^<]*/u', '', view($template, $data)->render())
            );
        });

        return $this->lease($attributes + [
            'tenant_id' => Customer::factory()->create(['user_id' => User::factory()->create()->id])->id,
            'monthly_rent' => 100_000,
            'start_date' => now()->subMonth()->toDateString(),
            'end_date' => now()->addYears(2)->toDateString(),
        ]);
    }

    /**
     * Le réglage passe de 2 à 6 mois APRÈS la signature : l'indemnité exécutée reste celle que le
     * contrat signé imprime. Avant, `computePenalty` relisait le réglage le jour J (600 000).
     */
    public function test_the_frozen_penalty_survives_a_setting_change(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 2);
        $lease = $this->signableLease();
        app(LeaseSignatureService::class)->request($lease, $lease->landlord);
        $this->setting(EarlyTerminationService::SETTING_KEY, 6);

        $fresh = $lease->fresh();
        $this->assertSame(2, $fresh->early_termination_penalty_months);
        $this->assertStringContainsString('2 mois de loyer au plus', (string) $fresh->frozenContractBytes());
        $this->assertEquals(200_000, app(EarlyTerminationService::class)->computePenalty($fresh, now()->addMonth()));
    }

    /** Le plafond de révision est imprimé et figé : relevé à 50 % ensuite, il ne laisse pas passer +30 %. */
    public function test_the_frozen_rent_review_cap_survives_a_setting_change(): void
    {
        $this->setting(RentReviewService::SETTING_KEY, 20);
        $lease = $this->signableLease();
        app(LeaseSignatureService::class)->request($lease, $lease->landlord);
        $this->setting(RentReviewService::SETTING_KEY, 50);
        $lease->fresh()->forceFill(['status' => LeaseStatus::Active])->save();

        $this->assertStringContainsString('Variation de 20 % au plus', (string) $lease->fresh()->frozenContractBytes());
        try {
            app(RentReviewService::class)->review($lease->fresh(), $lease->landlord, ['new_rent' => 130_000, 'reason' => 'Révision annuelle du loyer']);
            $this->fail('une hausse de 30 % passe un plafond figé à 20 %');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('new_rent', $e->errors());
        }
        $this->assertEquals(100_000, (float) $lease->fresh()->monthly_rent);
    }

    /** La voie papier fige aussi : le réglage du moment de l'activation, pas celui du jour J. */
    public function test_the_paper_path_freezes_the_execution_terms(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 3);
        $this->setting(RentReviewService::SETTING_KEY, 12);
        $lease = $this->signableLease();

        app(LeaseSignatureService::class)->signOnPaper($lease, UploadedFile::fake()->create('bail.pdf', 20, 'application/pdf'), $lease->landlord);

        $fresh = $lease->fresh();
        $this->assertSame([3, 12.0], [$fresh->early_termination_penalty_months, (float) $fresh->rent_review_max_pct]);
    }

    /** Une valeur négociée sur le bail (brouillon) l'emporte sur le réglage, et c'est elle qui est figée. */
    public function test_a_negotiated_value_is_the_one_frozen(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 2);
        $lease = $this->signableLease();
        Sanctum::actingAs($lease->landlord);
        $this->patchJson("/api/leases/{$lease->id}", ['early_termination_penalty_months' => 1, 'rent_review_max_pct' => 5])->assertOk();

        app(LeaseSignatureService::class)->request($lease->fresh(), $lease->landlord);

        $fresh = $lease->fresh();
        $this->assertSame(1, $fresh->early_termination_penalty_months);
        $this->assertStringContainsString('1 mois de loyer au plus', (string) $fresh->frozenContractBytes());
        $this->assertStringContainsString('Variation de 5 % au plus', (string) $fresh->frozenContractBytes());
    }

    public function test_frozen_execution_terms_cannot_be_patched_on_an_active_lease(): void
    {
        $lease = $this->lease(['status' => LeaseStatus::Active, 'early_termination_penalty_months' => 2, 'rent_review_max_pct' => 20]);
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['early_termination_penalty_months' => 6])
            ->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');
        $this->patchJson("/api/leases/{$lease->id}", ['rent_review_max_pct' => 80])
            ->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');

        $this->assertSame([2, 20.0], [$lease->fresh()->early_termination_penalty_months, (float) $lease->fresh()->rent_review_max_pct]);
    }

    // ── VERIF-596 passe 3 (N1') — le renouvellement recopie les termes figés du parent ───────────

    /** Un parent signé et actif ; ses termes d'exécution négociés en brouillon, puis figés. */
    private function signedParent(array $negotiated = [], array $attributes = []): Lease
    {
        $lease = $this->signableLease($attributes);
        Sanctum::actingAs($lease->landlord);
        if ($negotiated !== []) {
            $this->patchJson("/api/leases/{$lease->id}", $negotiated)->assertOk();
        }
        app(LeaseSignatureService::class)->request($lease->fresh(), $lease->landlord);
        $lease->fresh()->forceFill(['status' => LeaseStatus::Active])->save();

        return $lease->fresh();
    }

    private function renew(Lease $parent, array $payload = []): Lease
    {
        $this->postJson("/api/leases/{$parent->id}/renew", $payload + ['end_date' => now()->addYears(5)->toDateString()])
            ->assertCreated();

        return Lease::query()->where('renewed_from_lease_id', $parent->id)->firstOrFail();
    }

    /**
     * Avant : l'enfant naissait `active` avec les deux colonnes nulles, et exécutait le réglage
     * global relu au jour J — 6 mois et +15 % là où le locataire avait signé 1 mois et 5 %.
     */
    public function test_a_renewal_without_signature_keeps_the_parent_frozen_terms(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 2);
        $this->setting(RentReviewService::SETTING_KEY, 20);
        $parent = $this->signedParent(['early_termination_penalty_months' => 1, 'rent_review_max_pct' => 5]);

        $child = $this->renew($parent);
        $this->setting(EarlyTerminationService::SETTING_KEY, 6);

        $this->assertSame(LeaseStatus::Active, $child->status);
        $this->assertSame([1, 5.0], [$child->early_termination_penalty_months, (float) $child->rent_review_max_pct]);
        $this->assertEquals(100_000, app(EarlyTerminationService::class)->computePenalty($child->fresh(), now()->addYears(3)));
        try {
            app(RentReviewService::class)->review($child->fresh(), $child->landlord, ['new_rent' => 115_000, 'reason' => 'Révision annuelle du loyer']);
            $this->fail('une hausse de 15 % passe le plafond de 5 % signé sur le parent');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('new_rent', $e->errors());
        }
        $this->assertEquals(100_000, (float) $child->fresh()->monthly_rent);
    }

    /** Un parent antérieur (colonnes nulles) donne un enfant nul : il garde la sémantique du réglage. */
    public function test_a_renewal_of_a_legacy_lease_stays_unfrozen(): void
    {
        $parent = $this->lease(['status' => LeaseStatus::Active, 'monthly_rent' => 100_000, 'end_date' => now()->addMonths(2)->toDateString()]);
        Sanctum::actingAs($parent->landlord);

        $child = $this->renew($parent);

        $this->assertSame([null, null], [$child->early_termination_penalty_months, $child->rent_review_max_pct]);
    }

    /** Renégocier au renouvellement est légitime : le corps l'emporte sur le parent, dans les bornes du PATCH. */
    public function test_a_renewal_can_renegotiate_the_execution_terms(): void
    {
        $parent = $this->signedParent(['early_termination_penalty_months' => 1, 'rent_review_max_pct' => 5]);

        $this->postJson("/api/leases/{$parent->id}/renew", ['early_termination_penalty_months' => 13])
            ->assertStatus(422)->assertJsonValidationErrors('early_termination_penalty_months');
        $this->postJson("/api/leases/{$parent->id}/renew", ['rent_review_max_pct' => 101])
            ->assertStatus(422)->assertJsonValidationErrors('rent_review_max_pct');

        $child = $this->renew($parent, ['early_termination_penalty_months' => 3, 'rent_review_max_pct' => 8]);

        $this->assertSame([3, 8.0], [$child->early_termination_penalty_months, (float) $child->rent_review_max_pct]);
        // VERIF-596 passe 4 (m-e, P4-N1p.e) — le journal et l'avis de renouvellement nomment les
        // termes renégociés : le locataire ne les apprend pas au contrat seulement.
        $changes = Activity::query()->where('event', 'lease_renewed')->where('subject_id', $parent->id)->sole()->properties['changes'];
        $this->assertEquals(['from' => 1, 'to' => 3], $changes['early_termination_penalty_months']);
        $this->assertEquals(['from' => '5.00', 'to' => '8.00'], $changes['rent_review_max_pct']);
    }

    /** Un enfant `pending_signature` hérite de la valeur négociée, que la demande fige et imprime. */
    public function test_a_renewal_awaiting_signature_prints_the_inherited_terms(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 2);
        $parent = $this->signedParent(['early_termination_penalty_months' => 1, 'rent_review_max_pct' => 5]);
        Setting::query()->updateOrCreate(['key' => 'lease.require_signature'], ['value' => true, 'scope' => SettingScope::Global]);
        $this->setting(EarlyTerminationService::SETTING_KEY, 6);

        $child = $this->renew($parent);
        $this->assertSame(LeaseStatus::PendingSignature, $child->status);
        app(LeaseSignatureService::class)->request($child, $child->landlord);

        $frozen = (string) $child->fresh()->frozenContractBytes();
        $this->assertSame(1, $child->fresh()->early_termination_penalty_months);
        $this->assertStringContainsString('1 mois de loyer au plus', $frozen);
        $this->assertStringContainsString('Variation de 5 % au plus', $frozen);
    }

    // ── VERIF-596 passe 3 (m-a) — un PATCH qui croise une activation se juge sous verrou ──────────

    /**
     * La seconde signature valide l'activation APRÈS la liaison de route (instance encore
     * `pending_signature`) et AVANT le contrôle du statut : la policy est le dernier point entre les
     * deux. Avant : le contrôle passait sur l'instance périmée, les termes s'écrivaient sur un bail
     * actif, et la garde du modèle — lisant l'ancien statut — défigeait son contrat.
     */
    public function test_a_patch_racing_an_activation_is_judged_on_the_locked_row(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 2);
        $lease = $this->signableLease();
        app(LeaseSignatureService::class)->request($lease, $lease->landlord);
        $before = $lease->fresh();
        $this->assertNotNull($before->contract_sha256);

        $activated = false;
        Gate::before(function ($user, string $ability, array $arguments) use ($lease, &$activated) {
            if (! $activated && $ability === 'update' && ($arguments[0] ?? null) instanceof Lease) {
                $activated = true;
                Lease::query()->whereKey($lease->id)->update(['status' => LeaseStatus::Active->value, 'signed_at' => now()]);
            }

            return null;
        });
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['early_termination_penalty_months' => 6, 'late_fee_percent' => 40])
            ->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');

        $this->assertTrue($activated);
        $after = $lease->fresh();
        $this->assertSame(LeaseStatus::Active, $after->status);
        $this->assertSame($before->contract_sha256, $after->contract_sha256);
        $this->assertSame(2, $after->early_termination_penalty_months);
        $this->assertEquals((float) $before->late_fee_percent, (float) $after->late_fee_percent);
    }

    // ── VERIF-596 passe 3 (m-b) — `force` ne dépasse pas un plafond figé ─────────────────────────

    /**
     * Le contrat signé imprime « Variation de 10 % au plus », sans réserve : la plateforme n'exécute
     * pas une exception qu'aucune partie n'a lue. Le dépassement d'un plafond contractuel passe par un
     * renouvellement ou un avenant signé. Avant : +30 % forcé par le super-admin passait (130 000).
     */
    public function test_force_cannot_exceed_a_frozen_rent_review_cap(): void
    {
        $this->setting(RentReviewService::SETTING_KEY, 10);
        $lease = $this->signableLease();
        app(LeaseSignatureService::class)->request($lease, $lease->landlord);
        $lease->fresh()->forceFill(['status' => LeaseStatus::Active])->save();
        $this->setting(RentReviewService::SETTING_KEY, 50);
        $this->actingAsRole('super_admin');

        $this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 130_000, 'reason' => 'Révision forcée', 'force' => true])
            ->assertStatus(422)->assertJsonPath('code', 'lease.rent_review_above_contract_cap');
        $this->assertEquals(100_000, (float) $lease->fresh()->monthly_rent);

        $this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 110_000, 'reason' => 'Révision au plafond', 'force' => true])
            ->assertOk();
        $this->assertEquals(110_000, (float) $lease->fresh()->monthly_rent);
    }

    /** Un bail antérieur (plafond non figé) : `force` dépasse encore le réglage, avec la capacité. */
    public function test_force_still_exceeds_the_setting_on_a_legacy_lease(): void
    {
        Notification::fake();
        $this->setting(RentReviewService::SETTING_KEY, 10);
        $lease = $this->lease(['status' => LeaseStatus::Active, 'monthly_rent' => 100_000]);
        $this->assertNull($lease->rent_review_max_pct);
        $this->actingAsRole('super_admin');

        $this->patchJson("/api/leases/{$lease->id}/rent", ['new_rent' => 130_000, 'reason' => 'Révision forcée', 'force' => true])
            ->assertOk();
        $this->assertEquals(130_000, (float) $lease->fresh()->monthly_rent);
    }

    // ── VERIF-596 passe 4 (M-T) — la résiliation immédiate facture l'indemnité figée ─────────────

    /** Une activation validée à la LIAISON de route : l'instance liée reste `pending_signature`. */
    private function slipActivationAtBinding(int $id): void
    {
        $slipped = false;
        Lease::retrieved(function (Lease $model) use ($id, &$slipped): void {
            if (! $slipped && $model->id === $id && $model->status === LeaseStatus::PendingSignature) {
                $slipped = true;
                Lease::query()->whereKey($id)->update(['status' => LeaseStatus::Active->value, 'signed_at' => now()]);
            }
        });
    }

    private function terminationPenalty(Lease $lease): ?float
    {
        $rows = LeasePayment::query()->where('lease_id', $lease->id)->where('payment_type', LeasePaymentType::Penalty->value)->get();

        return $rows->isEmpty() ? null : (float) $rows->sum('amount');
    }

    /**
     * Avant : `LeaseService::terminate` facturait `min(mois restants, 3)` loyers en dur — 300 000
     * pour un contrat qui imprime « 1 mois » ou « 0 mois », 300 000 pour « 6 mois ».
     */
    public function test_an_immediate_termination_bills_the_frozen_penalty(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 2);
        $billed = [];
        foreach ([1 => 100_000.0, 0 => null, 6 => 600_000.0] as $months => $expected) {
            $lease = $this->signedParent(['early_termination_penalty_months' => $months], ['end_date' => now()->addMonths(10)->toDateString()]);
            $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'force majeure'])
                ->assertOk()->assertJsonPath('data.status', 'terminated');
            $billed[$months] = [$this->terminationPenalty($lease), $expected];
        }

        foreach ($billed as $months => [$actual, $expected]) {
            $this->assertSame($expected, $actual, "figé à {$months} mois");
        }
    }

    /** Un bail antérieur (colonne nulle) suit le réglage, exactement comme `computePenalty`. */
    public function test_an_immediate_termination_of_a_legacy_lease_follows_the_setting(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 4);
        $lease = $this->lease(['status' => LeaseStatus::Active, 'monthly_rent' => 100_000, 'end_date' => now()->addMonths(10)->toDateString()]);
        Sanctum::actingAs($lease->landlord);

        $this->postJson("/api/leases/{$lease->id}/terminate", [])->assertOk();

        $this->assertSame(400_000.0, $this->terminationPenalty($lease));
    }

    /**
     * m-c, volet `terminate` : une activation glissée à la liaison de route. Avant : le statut se
     * jugeait sur l'instance liée (`pending_signature`) et le bail actif était résilié sans indemnité.
     */
    public function test_an_immediate_termination_is_judged_on_the_locked_row(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 2);
        $lease = $this->signableLease(['end_date' => now()->addMonths(10)->toDateString()]);
        app(LeaseSignatureService::class)->request($lease, $lease->landlord);
        $this->slipActivationAtBinding($lease->id);
        Sanctum::actingAs($lease->landlord);

        $this->postJson("/api/leases/{$lease->id}/terminate", [])->assertOk();

        $this->assertSame(LeaseStatus::Terminated, $lease->fresh()->status);
        $this->assertSame(200_000.0, $this->terminationPenalty($lease));
    }

    // ── VERIF-596 passe 4 (M-R) — la demande ne fige pas un rendu que le bail ne porte plus ──────

    /** Le rendu exécute `$during` une fois, comme une écriture concurrente validée pendant le rendu. */
    private function renderingWhile(callable $during): void
    {
        $done = false;
        $this->mock(DocumentPdfService::class, function ($mock) use ($during, &$done): void {
            $mock->shouldReceive('render')->andReturnUsing(function (string $template, array $data) use ($during, &$done) {
                $html = (string) preg_replace('/Document généré le [^<]*/u', '', view($template, $data)->render());
                if (! $done) {
                    $done = true;
                    $during();
                }

                return $html;
            });
        });
    }

    private function assertNothingFrozen(Lease $lease): void
    {
        $fresh = $lease->fresh();
        $this->assertSame(LeaseStatus::Draft, $fresh->status);
        $this->assertNull($fresh->contract_sha256);
        $this->assertCount(0, $fresh->getMedia('signed_contract'));
    }

    /**
     * Émulation Q2c : un `PATCH` (5 % → 40 %) valide pendant le rendu, hors verrou. Avant : le bail
     * était figé sur un PDF qui imprime « 5 % » quand le bail exécute 40 %.
     */
    public function test_a_term_patched_during_the_render_is_never_frozen(): void
    {
        $lease = $this->signableLease(['late_fee_percent' => 5, 'late_fee_grace_days' => 3]);
        $this->renderingWhile(fn () => Lease::query()->whereKey($lease->id)->update(['late_fee_percent' => 40, 'late_fee_grace_days' => 0]));
        Sanctum::actingAs($lease->landlord);

        $this->postJson("/api/leases/{$lease->id}/signature-request")
            ->assertStatus(409)->assertJsonPath('code', 'lease_signature.terms_changed');

        $this->assertNothingFrozen($lease);
        $this->assertEquals(40, (float) $lease->fresh()->late_fee_percent);
    }

    /** Un terme d'exécution changé pendant le rendu n'est pas écrasé en silence par la valeur rendue. */
    public function test_an_execution_term_changed_during_the_render_is_not_overwritten(): void
    {
        $this->setting(EarlyTerminationService::SETTING_KEY, 2);
        $lease = $this->signableLease(['early_termination_penalty_months' => 1]);
        $this->renderingWhile(fn () => Lease::query()->whereKey($lease->id)->update(['early_termination_penalty_months' => 6]));
        Sanctum::actingAs($lease->landlord);

        $this->postJson("/api/leases/{$lease->id}/signature-request")
            ->assertStatus(409)->assertJsonPath('code', 'lease_signature.terms_changed');

        $this->assertNothingFrozen($lease);
        $this->assertSame(6, $lease->fresh()->early_termination_penalty_months);
    }

    /** Un garant rattaché pendant le rendu : le contrat rendu ne l'imprime pas, rien n'est figé. */
    public function test_a_guarantor_attached_during_the_render_is_never_frozen(): void
    {
        $lease = $this->signableLease();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $lease->landlord_id]);
        $this->renderingWhile(fn () => $lease->guarantors()->attach($guarantor->id));
        Sanctum::actingAs($lease->landlord);

        $this->postJson("/api/leases/{$lease->id}/signature-request")
            ->assertStatus(409)->assertJsonPath('code', 'lease_signature.terms_changed');

        $this->assertNothingFrozen($lease);
    }

    /** Sans écriture concurrente, la demande fige comme avant. */
    public function test_a_quiet_render_is_frozen(): void
    {
        $lease = $this->signableLease();
        $this->renderingWhile(fn () => null);
        Sanctum::actingAs($lease->landlord);

        $this->postJson("/api/leases/{$lease->id}/signature-request")->assertOk();

        $this->assertNotNull($lease->fresh()->contract_sha256);
        $this->assertCount(1, $lease->fresh()->getMedia('signed_contract'));
    }

    // ── VERIF-596 passe 4 (m-c) — un garant ajouté ou retiré se juge sur la ligne verrouillée ────

    /**
     * Activation glissée à la liaison de route. Avant : `unfreezeContract()` jugeait l'instance liée
     * (`pending_signature`) et remettait à NULL l'empreinte d'un bail devenu actif.
     */
    public function test_attaching_a_guarantor_racing_an_activation_keeps_the_frozen_contract(): void
    {
        $lease = $this->signableLease();
        app(LeaseSignatureService::class)->request($lease, $lease->landlord);
        $sha = $lease->fresh()->contract_sha256;
        $this->slipActivationAtBinding($lease->id);
        Sanctum::actingAs($lease->landlord);

        $this->postJson("/api/leases/{$lease->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop', 'phone' => '+221770000000'])
            ->assertCreated();

        $this->assertSame(LeaseStatus::Active, $lease->fresh()->status);
        $this->assertSame($sha, $lease->fresh()->contract_sha256);
    }

    public function test_detaching_a_guarantor_racing_an_activation_keeps_the_frozen_contract(): void
    {
        $lease = $this->signableLease();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $lease->landlord_id]);
        $lease->guarantors()->attach($guarantor->id);
        app(LeaseSignatureService::class)->request($lease->fresh(), $lease->landlord);
        $sha = $lease->fresh()->contract_sha256;
        $this->slipActivationAtBinding($lease->id);
        Sanctum::actingAs($lease->landlord);

        $this->deleteJson("/api/leases/{$lease->id}/guarantors/{$guarantor->id}")->assertOk();

        $this->assertSame(LeaseStatus::Active, $lease->fresh()->status);
        $this->assertSame($sha, $lease->fresh()->contract_sha256);
    }

    // ── VERIF-596 passe 4 (m-d) — un renouvellement qui change un terme signé se signe ───────────

    /**
     * Parent figé à 10 %, actif un an encore : un renouvellement à J+1 à +50 % naissait `active` dès
     * le lendemain, sans signature du locataire — un avenant unilatéral qui dépassait le plafond que
     * m-b refuse même au super-admin. Désormais il naît `pending_signature`, quel que soit le réglage,
     * et ne s'exécute qu'une fois signé (ici, la voie papier).
     */
    public function test_a_renewal_changing_a_signed_term_awaits_signature(): void
    {
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        $parent = $this->signedParent(['rent_review_max_pct' => 10], ['end_date' => now()->addYear()->toDateString()]);

        $child = $this->renew($parent, ['start_date' => now()->addDay()->toDateString(), 'monthly_rent' => 150_000]);

        $this->assertSame(LeaseStatus::PendingSignature, $child->status);
        $this->assertNull($child->signed_at);
        $this->assertEquals(150_000, (float) $child->monthly_rent);
        $this->assertEquals(100_000, (float) $parent->fresh()->monthly_rent);
        Bus::assertNotDispatched(GenerateLeasePaymentSchedule::class);

        app(LeaseSignatureService::class)->signOnPaper($child, UploadedFile::fake()->create('avenant.pdf', 20, 'application/pdf'), $child->landlord);
        $this->assertSame(LeaseStatus::Active, $child->fresh()->status);
    }

    /** Chaque terme imprimé renégociable compte, pas seulement le loyer. */
    public function test_any_signed_term_change_makes_the_renewal_await_signature(): void
    {
        $changes = [
            'deposit_amount' => 900_000, 'late_fee_percent' => 9, 'late_fee_grace_days' => 1,
            'terms' => 'Clauses neuves.', 'special_conditions' => 'AUCUN ANIMAL',
            'early_termination_penalty_months' => 12, 'rent_review_max_pct' => 100,
        ];
        $statuses = [];
        foreach ($changes as $field => $value) {
            $parent = $this->signedParent();
            $statuses[$field] = $this->renew($parent, [$field => $value])->status;
        }

        $this->assertSame(array_fill_keys(array_keys($changes), LeaseStatus::PendingSignature), $statuses);
    }

    /** Sans changement de terme — dates seules, ou loyer redit à l'identique — rien ne change. */
    public function test_a_renewal_without_term_change_is_active_as_before(): void
    {
        $parent = $this->signedParent(['rent_review_max_pct' => 10]);

        $child = $this->renew($parent, ['monthly_rent' => 100_000]);

        $this->assertSame(LeaseStatus::Active, $child->status);
    }

    /** Un parent antérieur (rien de figé) garde le comportement du réglage, même à loyer changé. */
    public function test_a_legacy_renewal_changing_the_rent_is_active_as_before(): void
    {
        $parent = $this->lease(['status' => LeaseStatus::Active, 'monthly_rent' => 100_000, 'end_date' => now()->addMonths(2)->toDateString()]);
        Sanctum::actingAs($parent->landlord);

        $child = $this->renew($parent, ['monthly_rent' => 150_000]);

        $this->assertSame(LeaseStatus::Active, $child->status);
    }

    // ── VERIF-596 passe 4 (m-e) — ce que les tests de m-a ne gardaient pas ───────────────────────

    /** P4-ma.b — le `PATCH` relit la ligne SOUS verrou : sans `FOR UPDATE`, la course réelle gagne 6 fois sur 6. */
    public function test_the_patch_reads_the_lease_for_update(): void
    {
        $lease = $this->lease(['late_fee_percent' => 5]);
        Sanctum::actingAs($lease->landlord);
        $locks = [];
        DB::listen(function (QueryExecuted $query) use (&$locks): void {
            if (preg_match('/from "leases" .*for update/i', $query->sql)) {
                $locks[] = $query->sql;
            }
        });

        $this->patchJson("/api/leases/{$lease->id}", ['late_fee_percent' => 7])->assertOk();

        $this->assertNotEmpty($locks, 'aucun select … from "leases" … for update pendant le PATCH');
    }

    /**
     * P4-ma.c — l'ordre inverse de m-a : la liaison lit un brouillon, une demande de signature fige
     * avant le verrou. L'écriture doit porter sur la ligne verrouillée, dont la garde du modèle voit
     * `pending_signature` et défige ; sur l'instance liée (`draft`), le contrat resterait figé sur
     * un terme qui n'est plus celui du bail.
     */
    public function test_a_patch_racing_a_signature_request_unfreezes_the_contract(): void
    {
        $lease = $this->signableLease(['late_fee_percent' => 5]);
        app(LeaseSignatureService::class)->request($lease, $lease->landlord);
        $this->assertNotNull($lease->fresh()->contract_sha256);
        Lease::query()->whereKey($lease->id)->update(['status' => LeaseStatus::Draft->value]);
        $requested = false;
        Lease::retrieved(function (Lease $model) use ($lease, &$requested): void {
            if (! $requested && $model->id === $lease->id && $model->status === LeaseStatus::Draft) {
                $requested = true;
                Lease::query()->whereKey($lease->id)->update(['status' => LeaseStatus::PendingSignature->value]);
            }
        });
        Sanctum::actingAs($lease->landlord);

        $this->patchJson("/api/leases/{$lease->id}", ['late_fee_percent' => 40])->assertOk();

        $this->assertTrue($requested);
        $fresh = $lease->fresh();
        $this->assertEquals(40, (float) $fresh->late_fee_percent);
        $this->assertNull($fresh->contract_sha256, 'le contrat figé imprime encore 5 %');
    }
}
