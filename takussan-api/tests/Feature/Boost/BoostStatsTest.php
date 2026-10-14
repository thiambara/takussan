<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §10) — impressions et clics comptés en cache par boost et par heure, versés
 * par `boosts:tick` dans `property_boost_daily_stats`, une fois. Un clic = une vue de la fiche arrivée
 * par `src=sponsored`, une par IP et par heure.
 */
class BoostStatsTest extends TestCase
{
    use RefreshDatabase;

    private Property $property;

    private PropertyBoost $boost;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:20:00'));
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $this->boost = app(BoostPurchaseService::class)->purchase(
            $this->property, BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(), $admin,
        );
    }

    public function test_les_compteurs_se_versent_une_fois_par_le_tick(): void
    {
        $recorder = app(BoostStatsRecorder::class);
        $recorder->impressions([$this->property->id, $this->property->id, 999999]);
        $recorder->click($this->property, '10.0.0.1');
        $recorder->click($this->property, '10.0.0.1');
        $recorder->click($this->property, '10.0.0.2');

        $this->artisan('boosts:tick')->assertSuccessful();
        $this->assertSame(0, DB::table('property_boost_daily_stats')->count(), 'l’heure en cours n’est pas versée');

        $this->travel(1)->hours();
        $this->artisan('boosts:tick')->assertSuccessful();
        $this->artisan('boosts:tick')->assertSuccessful();

        $ligne = DB::table('property_boost_daily_stats')->where('property_boost_id', $this->boost->id)->sole();
        $this->assertSame('2026-10-12', Carbon::parse($ligne->date)->toDateString());
        $this->assertSame(2, (int) $ligne->impressions);
        $this->assertSame(2, (int) $ligne->clicks, 'une par IP et par heure');
    }

    /**
     * Le curseur `LAST_FLUSHED_KEY` et le `pull` des compteurs protègent tous deux contre un double
     * versement — mesuré : remplacer `pull` par `get` laisse le test ci-dessus VERT, le curseur
     * suffisant. Ce test-ci perd le curseur (éviction du magasin, `cache:clear` partiel) : seul le
     * `pull` empêche alors de reverser les 48 dernières heures.
     */
    public function test_un_curseur_perdu_ne_reverse_rien(): void
    {
        app(BoostStatsRecorder::class)->impressions([$this->property->id]);
        $this->travel(1)->hours();
        $this->artisan('boosts:tick')->assertSuccessful();

        Cache::forget(BoostStatsRecorder::LAST_FLUSHED_KEY);
        $this->artisan('boosts:tick')->assertSuccessful();

        $this->assertSame(1, (int) DB::table('property_boost_daily_stats')->value('impressions'));
    }

    /** La rangée vedette de l'accueil est un emplacement : ses biens servis comptent une impression. */
    public function test_la_rangee_vedette_de_l_accueil_compte_une_impression(): void
    {
        $this->getJson('/api/public/properties/discovery')->assertOk()
            ->assertJsonPath('data.featured.items.0.id', $this->property->id);

        $this->assertSame(1, (int) Cache::get(BoostStatsRecorder::key($this->boost->id, now(), 'impressions')));
    }

    public function test_deux_heures_du_meme_jour_s_additionnent(): void
    {
        $recorder = app(BoostStatsRecorder::class);
        $recorder->impressions([$this->property->id]);
        $this->travel(1)->hours();
        $recorder->impressions([$this->property->id]);
        $this->travel(1)->hours();

        $this->artisan('boosts:tick')->assertSuccessful();

        $this->assertSame(2, (int) DB::table('property_boost_daily_stats')->value('impressions'));
    }

    public function test_une_vue_arrivee_par_un_emplacement_compte_un_clic(): void
    {
        $this->postJson("/api/public/properties/{$this->property->slug}/view?src=sponsored")->assertStatus(204);
        // Une AUTRE IP : depuis la même, le plafond « un clic par IP et par heure » rendrait ce
        // test vert même si la condition `src=sponsored` disparaissait (mesuré par ablation).
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.9'])
            ->postJson("/api/public/properties/{$this->property->slug}/view")->assertStatus(204);
        $this->travel(1)->hours();

        $this->artisan('boosts:tick')->assertSuccessful();

        $this->assertSame(1, (int) DB::table('property_boost_daily_stats')->value('clicks'));
    }
}
