<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\Radar\FingerprintRadarSourcePhotos;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\RadarListing;
use App\Models\RadarTarget;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\Targets\RadarTargetCriteria;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2468 (ADR-0087 §5, AC2, AC3) — l'API des cibles : lire (`platform.radar.operate`), créer, modifier et retirer
 * (`platform.radar.publish`, `super_admin` seul), et les annonces d'une cible après une VRAIE extraction (le job, l'agent
 * doublé par `RadarExtraction::fake()`).
 */
class RadarTargetApiTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase, SocleIaDEssai;

    private const CRITERIA = ['types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000,
        'neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']]];

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
    }

    /** @param  array<string, mixed>  $criteria */
    private function target(array $criteria = self::CRITERIA, RadarTargetStatus $status = RadarTargetStatus::Active, RadarTargetOrigin $origin = RadarTargetOrigin::Operator): RadarTarget
    {
        $normalized = RadarTargetCriteria::normalize($criteria);

        return RadarTarget::query()->create([
            'name' => 'Cible', 'origin' => $origin, 'status' => $status, 'criteria' => $normalized,
            'criteria_signature' => RadarTargetCriteria::signature($normalized),
            'demand_count' => $origin === RadarTargetOrigin::Demand ? 4 : null,
        ]);
    }

    // ── AC3 — les droits ──────────────────────────────────────────────────────────────────────

    public function test_le_support_lit_les_cibles_mais_n_ecrit_rien(): void
    {
        $target = $this->target();
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->getJson('/api/admin/radar/targets')->assertOk()->assertJsonPath('data.0.id', $target->id);
        $this->getJson("/api/admin/radar/targets/{$target->id}")->assertOk()->assertJsonPath('data.name', 'Cible');
        $this->getJson("/api/admin/radar/targets/{$target->id}/listings")->assertOk()->assertJsonPath('meta.total', 0);

        // Un corps invalide ne change rien : 403 avant toute validation.
        $this->postJson('/api/admin/radar/targets', ['name' => 'X', 'criteria' => self::CRITERIA])->assertForbidden();
        $this->postJson('/api/admin/radar/targets', ['criteria' => 'pas un tableau'])->assertForbidden();
        $this->patchJson("/api/admin/radar/targets/{$target->id}", ['name' => 'Y'])->assertForbidden();
        $this->deleteJson("/api/admin/radar/targets/{$target->id}")->assertForbidden();
        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['scope' => 'all'])->assertForbidden();

        $this->assertSame(1, RadarTarget::query()->count());
        $this->assertSame('Cible', $target->fresh()->name);
        $this->assertSame(RadarTargetStatus::Active, $target->fresh()->status);
    }

    public function test_un_viewer_ne_lit_pas_les_cibles(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);

        $this->getJson('/api/admin/radar/targets')->assertForbidden();
    }

    // ── Créer, lire, modifier, retirer ────────────────────────────────────────────────────────

    public function test_le_super_admin_cree_une_cible_de_l_operateur(): void
    {
        $porteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $data = $this->postJson('/api/admin/radar/targets', ['name' => 'F3 Almadies', 'criteria' => self::CRITERIA])
            ->assertCreated()
            ->json('data');

        $this->assertSame('F3 Almadies', $data['name']);
        $this->assertSame('operator', $data['origin']);
        $this->assertSame('active', $data['status']);
        $this->assertFalse($data['pinned']);
        $this->assertSame(0, $data['matches_count']);
        $this->assertNull($data['demand_count']);
        $this->assertNull($data['last_matched_at']);
        $this->assertSame(now()->toIso8601String(), $data['created_at']);
        $this->assertSame(RadarTargetCriteria::KEYS, array_keys($data['criteria']), 'Les critères rendus sont la forme normalisée.');
        $this->assertSame(700_000, $data['criteria']['price_max']);
        $this->assertSame([], $data['criteria']['cities']);
        $this->assertSame($porteur->id, RadarTarget::query()->value('created_by_id'));
        $this->assertDatabaseHas('activity_log', ['event' => 'radar_target_created', 'causer_id' => $porteur->id]);
    }

    public function test_une_cible_de_la_demande_ne_se_cree_pas_par_l_api(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson('/api/admin/radar/targets', ['name' => 'X', 'criteria' => self::CRITERIA, 'origin' => 'demand'])->assertUnprocessable();
        $this->assertSame(0, RadarTarget::query()->count());
    }

    public function test_des_criteres_refuses_rendent_un_422_code_et_rien_n_est_ecrit(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson('/api/admin/radar/targets', ['name' => 'Vide', 'criteria' => []])
            ->assertUnprocessable()->assertJsonPath('code', 'radar.targets.empty_criteria');
        $this->postJson('/api/admin/radar/targets', ['name' => 'Inversée', 'criteria' => ['price_min' => 9, 'price_max' => 1]])
            ->assertUnprocessable()->assertJsonPath('code', 'radar.targets.invalid_range')->assertJsonPath('params.field', 'criteria.price_min');
        $this->postJson('/api/admin/radar/targets', ['name' => 'Type', 'criteria' => ['types' => ['chateau']]])
            ->assertUnprocessable()->assertJsonPath('code', 'radar.targets.invalid_criteria')->assertJsonPath('params.field', 'criteria.types.0');
        $this->postJson('/api/admin/radar/targets', ['name' => 'Clé', 'criteria' => ['surface_min' => 10]])
            ->assertUnprocessable()->assertJsonPath('code', 'radar.targets.unknown_criterion');
        $this->postJson('/api/admin/radar/targets', ['criteria' => self::CRITERIA])->assertUnprocessable();

        $this->assertSame(0, RadarTarget::query()->count());
    }

    public function test_une_cible_vivante_ne_se_double_pas_a_la_casse_pres(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $first = $this->target();

        $same = self::CRITERIA;
        $same['neighborhoods'] = [['name' => 'ALMADIES', 'city' => 'dakar']];
        $this->postJson('/api/admin/radar/targets', ['name' => 'Bis', 'criteria' => $same])
            ->assertUnprocessable()->assertJsonPath('code', 'radar.targets.duplicate')->assertJsonPath('params.target_id', $first->id);

        // Retirée, elle n'empêche plus d'en créer une identique.
        $this->deleteJson("/api/admin/radar/targets/{$first->id}")->assertOk()->assertJsonPath('data.status', 'retired');
        $this->postJson('/api/admin/radar/targets', ['name' => 'Bis', 'criteria' => $same])->assertCreated();
    }

    public function test_au_dela_du_plafond_de_cibles_actives_la_creation_est_refusee(): void
    {
        config(['radar.targets.max_active' => 2]);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->target(['contract' => 'rent']);
        $this->target(['contract' => 'sale'], origin: RadarTargetOrigin::Demand);
        $paused = $this->target(['types' => ['villa']], RadarTargetStatus::Paused);

        $this->postJson('/api/admin/radar/targets', ['name' => 'Trop', 'criteria' => ['types' => ['studio']]])
            ->assertUnprocessable()->assertJsonPath('code', 'radar.targets.too_many')->assertJsonPath('params.max', 2);
        $this->patchJson("/api/admin/radar/targets/{$paused->id}", ['status' => 'active'])
            ->assertUnprocessable()->assertJsonPath('code', 'radar.targets.too_many');
        // En pause, elle ne compte pas.
        $this->postJson('/api/admin/radar/targets', ['name' => 'En pause', 'criteria' => ['types' => ['studio']], 'status' => 'paused'])
            ->assertCreated()->assertJsonPath('data.status', 'paused');
        $this->assertSame(2, RadarTarget::query()->where('status', 'active')->count());
    }

    /**
     * Décision du porteur (2a, 2026-11-04) — une cible retirée ne se modifie plus : ni réactivée, ni renommée, ni réglée
     * par `PATCH` (422 `radar.targets.retired`). Pour la reprendre, on en crée une nouvelle. La retirer de nouveau reste
     * sans effet (`DELETE` idempotent).
     */
    public function test_une_cible_retiree_ne_se_modifie_plus(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $retired = $this->target(status: RadarTargetStatus::Retired);
        $before = $retired->fresh()->only(['name', 'status', 'criteria', 'pinned']);

        foreach ([['status' => 'active'], ['status' => 'paused'], ['name' => 'Renommée'], ['pinned' => true], ['criteria' => ['contract' => 'sale']]] as $body) {
            $this->patchJson("/api/admin/radar/targets/{$retired->id}", $body)
                ->assertUnprocessable()->assertJsonPath('code', 'radar.targets.retired')->assertJsonPath('params.target_id', $retired->id);
        }

        $this->assertSame($before, $retired->fresh()->only(['name', 'status', 'criteria', 'pinned']));
        $this->deleteJson("/api/admin/radar/targets/{$retired->id}")->assertOk()->assertJsonPath('data.status', 'retired');
        // La reprendre, c'est en créer une nouvelle (les mêmes critères : la retirée ne compte plus comme doublon).
        $this->postJson('/api/admin/radar/targets', ['name' => 'Reprise', 'criteria' => self::CRITERIA])->assertCreated();
    }

    public function test_modifier_les_criteres_d_une_cible_de_la_demande_l_epingle(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $demand = $this->target(['contract' => 'rent'], origin: RadarTargetOrigin::Demand);
        $operator = $this->target(['contract' => 'sale']);

        $this->patchJson("/api/admin/radar/targets/{$demand->id}", ['name' => 'Renommée'])
            ->assertOk()->assertJsonPath('data.pinned', false)->assertJsonPath('data.name', 'Renommée');
        $this->patchJson("/api/admin/radar/targets/{$demand->id}", ['criteria' => ['contract' => 'rent', 'price_max' => 500_000]])
            ->assertOk()->assertJsonPath('data.pinned', true)->assertJsonPath('data.criteria.price_max', 500_000)
            ->assertJsonPath('data.demand_count', 4);
        $this->patchJson("/api/admin/radar/targets/{$operator->id}", ['criteria' => ['contract' => 'sale', 'price_max' => 1]])
            ->assertOk()->assertJsonPath('data.pinned', false);
        $this->patchJson("/api/admin/radar/targets/{$operator->id}", ['status' => 'retired'])->assertUnprocessable();
    }

    public function test_la_liste_se_filtre_et_se_trie(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $a = $this->target(['contract' => 'rent']);
        $b = $this->target(['contract' => 'sale'], origin: RadarTargetOrigin::Demand);
        $c = $this->target(['types' => ['villa']], RadarTargetStatus::Paused);
        $b->forceFill(['matches_count' => 7])->save();
        $c->forceFill(['matches_count' => 3])->save();

        $ids = fn (string $query) => array_column($this->getJson('/api/admin/radar/targets?'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$b->id], $ids('filter[origin]=demand'));
        $this->assertSame([$c->id], $ids('filter[status]=paused'));
        $this->assertSame([$b->id, $c->id, $a->id], $ids('sort=-matches_count'));
        $this->assertSame([$a->id], $ids('sort=-matches_count&per_page=1&page=3'));

        $one = $this->getJson('/api/admin/radar/targets?fields[radar_targets]=id,name')->assertOk()->json('data.0');
        $this->assertSame(['id', 'name'], array_keys($one), 'Sparse fieldsets : une colonne non demandée est omise.');
    }

    public function test_le_super_admin_regle_la_portee_d_une_source(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->getJson('/api/admin/radar/crawl/sources?fields[radar_crawl_sources]=id,site,scope')
            ->assertOk()->assertJsonPath('data.0.scope', 'targeted')->assertJsonPath('data.1.scope', 'targeted');
        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique', ['scope' => 'all'])->assertOk()->assertJsonPath('data.scope', 'all');
        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique', ['scope' => 'partout'])->assertUnprocessable();
        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique', ['enabled' => false])->assertOk()->assertJsonPath('data.scope', 'all');
        $this->getJson('/api/admin/radar/crawl/runs?fields[radar_crawl_runs]=id,cards_skipped')->assertOk();
    }

    // ── AC2 — une annonce extraite rejoint sa cible ───────────────────────────────────────────

    public function test_une_annonce_extraite_qui_remplit_les_criteres_est_listee_par_sa_cible(): void
    {
        $this->installerSocleDEssai();
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        Http::preventStrayRequests();
        Bus::fake([FingerprintRadarSourcePhotos::class]);

        $target = $this->target(['types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000]);
        $other = $this->target(['contract' => 'sale']);
        $support = $this->operateur(PlatformProfileLevel::Support);

        $field = fn (mixed $value) => ['value' => $value, 'confidence' => 'high', 'evidence' => is_string($value) ? $value : null];
        $output = array_fill_keys([...RadarExtraction::PROPERTY_FIELDS, 'advertiser_name'], ['value' => null, 'confidence' => 'low', 'evidence' => null]);
        RadarExtraction::fake(fn () => array_replace($output, [
            'property_type' => $field('apartment'),
            'contract' => $field('rent'),
            'price' => ['value' => '450.000f/mois', 'confidence' => 'high', 'evidence' => '450.000f/mois'],
            'advertiser_nature' => ['value' => 'unknown', 'confidence' => 'low', 'evidence' => null],
            'phones' => [],
            'nature_signals' => [],
        ]));
        $listing = RadarListing::factory()->create([
            'raw_text' => 'Appartement F3 à louer aux Almadies, 450.000f/mois.',
            'captured_by' => $support->id,
        ]);

        $this->app->call([(new ExtractRadarListing($listing->id))->withFakeQueueInteractions(), 'handle']);

        $this->assertSame(RadarListingStage::Extracted, $listing->fresh()->stage);
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->getJson("/api/admin/radar/targets/{$target->id}/listings?fields[radar_listings]=id,stage")
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $listing->id);
        $this->getJson("/api/admin/radar/targets/{$target->id}")
            ->assertOk()
            ->assertJsonPath('data.matches_count', 1)
            ->assertJsonPath('data.last_matched_at', now()->toIso8601String());
        $this->getJson("/api/admin/radar/targets/{$other->id}/listings")->assertOk()->assertJsonPath('meta.total', 0);
    }
}
