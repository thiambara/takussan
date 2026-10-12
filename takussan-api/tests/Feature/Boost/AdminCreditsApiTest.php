<?php

namespace Tests\Feature\Boost;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §4, §5, §10 ; AC16) — la console : catalogue, portefeuilles, ajustements
 * motivés et journalisés, annulation avec ou sans remboursement, Vedette offerte, statistiques.
 */
class AdminCreditsApiTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['name' => 'Agence Teranga']);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
    }

    public function test_seul_le_super_admin_entre(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->getJson('/api/admin/credit-wallets')->assertForbidden();
        $this->postJson("/api/admin/credit-wallets/{$this->agency->id}/adjustments", ['amount' => 10, 'reason' => 'Geste commercial'])->assertForbidden();
    }

    public function test_le_catalogue_se_regle_et_se_journalise(): void
    {
        $this->actingAsRole('super_admin');
        $bump = BoostProduct::query()->where('kind', 'bump')->sole();

        $this->getJson('/api/admin/boost-products')->assertOk()->assertJsonCount(6, 'data');
        $this->patchJson("/api/admin/boost-products/{$bump->id}", ['price_credits' => 8, 'is_active' => false])
            ->assertOk()->assertJsonPath('data.price_credits', 8)->assertJsonPath('data.is_active', false);
        $this->postJson('/api/admin/boost-products', ['kind' => 'featured', 'duration_days' => 60, 'price_credits' => 100])
            ->assertCreated()->assertJsonPath('data.duration_days', 60);
        $this->postJson('/api/admin/boost-products', ['kind' => 'badge', 'duration_days' => 7, 'price_credits' => 10])
            ->assertStatus(422)->assertJsonValidationErrors('variant');
        $this->postJson('/api/admin/boost-products', ['kind' => 'featured', 'duration_days' => 7, 'price_credits' => 1])
            ->assertStatus(422)->assertJsonValidationErrors('duration_days');

        $this->assertTrue(Activity::query()->where('event', 'super_admin_boost_product_updated')->exists());
        $this->assertTrue(Activity::query()->where('event', 'super_admin_boost_product_created')->exists());
    }

    public function test_un_ajustement_exige_un_motif_et_se_journalise(): void
    {
        $this->actingAsRole('super_admin');
        $url = "/api/admin/credit-wallets/{$this->agency->id}/adjustments";

        $this->postJson($url, ['amount' => 50])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->postJson($url, ['amount' => 0, 'reason' => 'Geste commercial'])->assertStatus(422)->assertJsonValidationErrors('amount');

        $this->postJson($url, ['amount' => 50, 'reason' => 'Geste commercial'])->assertOk()->assertJsonPath('data.balance', 150);
        $this->postJson($url, ['amount' => -30, 'reason' => 'Correction d’erreur'])->assertOk()->assertJsonPath('data.balance', 120);
        $this->postJson($url, ['amount' => -1000, 'reason' => 'Correction d’erreur'])
            ->assertStatus(422)->assertJsonPath('code', 'credits.insufficient');

        $this->assertSame(1, CreditLot::query()->where('origin', CreditLotOrigin::AdminGrant)->count());
        $this->assertSame(2, Activity::query()->where('event', 'super_admin_credits_adjusted')->count());
        $this->assertSame([], app(CreditLedger::class)->invariantViolations());

        $this->getJson("/api/admin/credit-wallets/{$this->agency->id}")
            ->assertOk()->assertJsonPath('data.balance', 120)->assertJsonPath('data.agency.name', 'Agence Teranga');
        $this->getJson('/api/admin/credit-wallets?search=teranga')
            ->assertOk()->assertJsonPath('data.0.id', $this->agency->id)->assertJsonPath('data.0.balance', 120);
    }

    public function test_annuler_avec_ou_sans_remboursement(): void
    {
        $operateur = $this->actingAsRole('super_admin');
        [$rembourse, $sec] = $this->deuxVedettes();

        $this->postJson("/api/admin/boosts/{$rembourse->id}/cancel", ['refund' => true])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->postJson("/api/admin/boosts/{$rembourse->id}/cancel", ['refund' => true, 'reason' => 'Annonce en double'])
            ->assertOk()->assertJsonPath('data.status', 'refunded');
        $this->postJson("/api/admin/boosts/{$sec->id}/cancel", ['refund' => false, 'reason' => 'Contenu trompeur'])
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->postJson("/api/admin/boosts/{$sec->id}/cancel", ['refund' => false, 'reason' => 'Contenu trompeur'])
            ->assertStatus(422)->assertJsonPath('code', 'boost.not_live');

        $this->assertSame(1, CreditLot::query()->where('origin', CreditLotOrigin::Refund)->count());
        $this->assertSame($operateur->id, PropertyBoost::query()->find($sec->id)->cancelled_by_id);
        $this->assertSame(2, Activity::query()->where('event', 'super_admin_boost_cancelled')->count());
        $this->getJson('/api/admin/boosts?filter[status]=cancelled')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_une_vedette_offerte_ne_coute_rien_et_porte_son_motif(): void
    {
        $this->actingAsRole('super_admin');
        $property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 15)->sole();

        $this->postJson("/api/admin/properties/{$property->id}/offered-boost", ['product_id' => $offre->id, 'reason' => 'Lancement de l’agence'])
            ->assertCreated()->assertJsonPath('data.offered', true)->assertJsonPath('data.price_credits', 0)
            ->assertJsonPath('data.offer_reason', 'Lancement de l’agence');

        $this->assertSame(1, CreditMovement::query()->count(), 'seul l’octroi de bienvenue');
        $this->assertTrue((bool) $property->fresh()->featured);
        $this->assertTrue(Activity::query()->where('event', 'super_admin_boost_offered')->exists());
    }

    public function test_les_statistiques_rendent_le_taux_de_clic(): void
    {
        $this->actingAsRole('super_admin');
        [$vedette] = $this->deuxVedettes();
        DB::table('property_boost_daily_stats')->insert([
            ['property_boost_id' => $vedette->id, 'date' => now()->toDateString(), 'impressions' => 200, 'clicks' => 10, 'created_at' => now(), 'updated_at' => now()],
            ['property_boost_id' => $vedette->id, 'date' => now()->subDay()->toDateString(), 'impressions' => 100, 'clicks' => 5, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->getJson('/api/admin/boost-stats?from='.now()->subDays(6)->toDateString().'&to='.now()->toDateString())
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('totals.impressions', 300)
            ->assertJsonPath('totals.clicks', 15)
            ->assertJsonPath('totals.ctr', 0.05);
    }

    public function test_une_fenetre_de_plus_de_92_jours_est_refusee_par_son_code(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/boost-stats?from='.now()->subDays(93)->toDateString().'&to='.now()->toDateString())
            ->assertStatus(422)->assertJsonPath('code', 'boost.stats_window_too_wide');
        $this->getJson('/api/admin/boost-stats?from='.now()->subDays(92)->toDateString().'&to='.now()->toDateString())
            ->assertOk();
    }

    /**
     * Un acheteur quelconque : `purchase()` n'autorise pas (c'est le rôle de la FormRequest), et
     * `purchased_by_id` n'est lu que pour notifier.
     *
     * @return array{0: PropertyBoost, 1: PropertyBoost}
     */
    private function deuxVedettes(): array
    {
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();
        $achat = fn () => app(BoostPurchaseService::class)->purchase(
            Property::factory()->published()->create(['agency_id' => $this->agency->id]), $offre, User::factory()->create(),
        );

        return [$achat(), $achat()];
    }
}
