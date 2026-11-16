<?php

namespace Tests\Feature\Lease;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\EarlyTerminationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\LaravelPdf\Facades\Pdf;
use Tests\TestCase;

/**
 * TCK-2906 (AC3) — le préavis de départ (`notice_period_days`) se saisit à la création et à la mise à jour
 * d'un brouillon, borné (1-365 jours), prérempli par `GET /api/leases/defaults`, imprimé au contrat (« 90
 * jour(s) (3 mois) »). Il était rendu, jamais accepté. L'annulation d'un départ anticipé ne l'efface plus.
 */
class LeaseNoticePeriodTest extends TestCase
{
    use RefreshDatabase;

    private User $bailleur;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->bailleur = User::factory()->create();
        $this->bien = Property::factory()->create(['user_id' => $this->bailleur->id]);
        Sanctum::actingAs($this->bailleur);
    }

    /** @return array<string, mixed> */
    private function corps(array $extra = []): array
    {
        return $extra + [
            'property_id' => $this->bien->id,
            'tenant_id' => Customer::factory()->create(['added_by_id' => $this->bailleur->id])->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'monthly_rent' => 300000,
            'currency' => 'XOF',
        ];
    }

    public function test_ac3_le_preavis_saisi_a_la_creation_est_enregistre_et_imprime_en_mois(): void
    {
        $id = $this->postJson('/api/leases', $this->corps(['notice_period_days' => 90]))
            ->assertCreated()->assertJsonPath('data.notice_period_days', 90)->json('data.id');

        $this->assertSame(90, Lease::query()->findOrFail($id)->notice_period_days);

        $pdf = Pdf::fake();
        $this->get("/api/leases/{$id}/contract/pdf")->assertOk();
        $this->assertStringContainsString('90 jour(s) (3 mois)', (string) $pdf->html);
    }

    /** @return array<string, array{mixed}> */
    public static function horsBornes(): array
    {
        return ['zéro' => [0], 'au-delà d\'un an' => [400], 'fractionnaire' => [30.5]];
    }

    #[DataProvider('horsBornes')]
    public function test_ac3_un_preavis_hors_bornes_est_refuse(mixed $jours): void
    {
        $this->postJson('/api/leases', $this->corps(['notice_period_days' => $jours]))
            ->assertUnprocessable()->assertJsonValidationErrors('notice_period_days');
        $this->assertSame(0, Lease::query()->count());
    }

    public function test_le_brouillon_le_modifie_le_bail_signe_le_refuse(): void
    {
        $id = $this->postJson('/api/leases', $this->corps())->assertCreated()->json('data.id');

        $this->patchJson("/api/leases/{$id}", ['notice_period_days' => 60])->assertOk()->assertJsonPath('data.notice_period_days', 60);
        $this->patchJson("/api/leases/{$id}", ['notice_period_days' => 0])->assertUnprocessable()->assertJsonValidationErrors('notice_period_days');

        Lease::query()->whereKey($id)->update(['status' => LeaseStatus::Active->value]);
        $this->patchJson("/api/leases/{$id}", ['notice_period_days' => 90])->assertStatus(422)->assertJsonPath('code', 'lease.terms_locked');
        $this->assertSame(60, Lease::query()->findOrFail($id)->notice_period_days);
    }

    public function test_les_valeurs_par_defaut_preremplissent_le_preavis(): void
    {
        $this->getJson("/api/leases/defaults?property_id={$this->bien->id}")->assertOk()
            ->assertJsonPath('data.notice_period_days', ['value' => EarlyTerminationService::DEFAULT_NOTICE_DAYS, 'source' => 'platform']);
    }

    public function test_annuler_un_depart_anticipe_garde_le_preavis_du_contrat(): void
    {
        $bail = Lease::factory()->active()->create([
            'landlord_id' => $this->bailleur->id,
            'property_id' => $this->bien->id,
            'tenant_id' => Customer::factory()->create()->id,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(9)->toDateString(),
            'monthly_rent' => 400_000,
            'notice_period_days' => 90,
        ]);
        $service = app(EarlyTerminationService::class);

        $service->request($bail, $this->bailleur, ['effective_date' => now()->addDays(100)->toDateString()]);
        $annule = $service->cancel($bail->fresh(), $this->bailleur);

        $this->assertSame(LeaseStatus::Active, $annule->status);
        $this->assertSame(90, $annule->fresh()->notice_period_days);
    }
}
