<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarDemandTargets;
use App\Jobs\Radar\RefreshRadarDemandTargets;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\RadarDemandSetting;
use App\Models\RadarTarget;
use App\Models\RadarTargetRevision;
use App\Models\SavedSearch;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\Targets\RadarDemandCurator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Queue;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2470 (ADR-0087 §6) — l'API des cibles de la demande : le réglage (`/demand`), « rafraîchir maintenant », et
 * l'historique des révisions (`/targets/revisions`, défaire). Lire : `platform.radar.operate` ; écrire : `super_admin`.
 */
class RadarDemandApiTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase, SocleIaDEssai;

    private const ALMADIES = ['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']], 'types' => ['apartment'], 'contract' => 'rent'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
        $this->installerSocleDEssai();
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Almadies', 'slug' => 'almadies']);
    }

    private function fakeCreate(): void
    {
        RadarDemandTargets::fake(fn () => ['operations' => [[
            'op' => 'create', 'target_id' => null, 'merge_ids' => [], 'name' => 'Appartements à louer, Almadies',
            'criteria' => self::ALMADIES + ['cities' => [], 'price_min' => null, 'price_max' => null, 'bedrooms_min' => null, 'bedrooms_max' => null, 'furnished' => null],
            'reason' => 'Deux recherches sans résultat.', 'signal_refs' => ['d1'],
        ]]]);
    }

    /** Une révision réelle : le réglage allumé par ce super-admin, une recherche sans résultat, un passage. */
    private function revision(): RadarTargetRevision
    {
        SavedSearch::factory()->create(['criteria' => ['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent'], 'results_count' => 0]);
        $this->fakeCreate();
        $this->patchJson('/api/admin/radar/demand', ['enabled' => true])->assertOk();
        app(RadarDemandCurator::class)->run();

        return RadarTargetRevision::query()->sole();
    }

    // ── Les droits ────────────────────────────────────────────────────────────────────────────

    public function test_le_support_lit_le_reglage_et_les_revisions_mais_n_ecrit_rien(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $revision = $this->revision();
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->getJson('/api/admin/radar/demand')->assertOk()->assertJsonPath('data.enabled', true);
        $this->getJson('/api/admin/radar/targets/revisions')->assertOk()->assertJsonPath('data.0.id', $revision->id);

        // Un corps invalide ne change rien : 403 avant toute validation.
        $this->patchJson('/api/admin/radar/demand', ['enabled' => false])->assertForbidden();
        $this->patchJson('/api/admin/radar/demand', ['enabled' => 'peut-être'])->assertForbidden();
        $this->postJson('/api/admin/radar/demand/refresh')->assertForbidden();
        $this->postJson("/api/admin/radar/targets/revisions/{$revision->id}/revert")->assertForbidden();

        $this->assertTrue(RadarDemandSetting::current()->enabled);
        $this->assertNull($revision->fresh()->reverted_at);
    }

    /** Revue du 2026-11-04 — le plafond des cibles de la demande vient de la configuration : la console ne le recopie pas. */
    public function test_le_reglage_dit_le_plafond_des_cibles_de_la_demande(): void
    {
        config(['radar.targets.max_demand' => 7]);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->getJson('/api/admin/radar/demand')->assertOk()->assertJsonPath('data.max_demand', 7);
    }

    public function test_un_viewer_ne_lit_rien(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);

        $this->getJson('/api/admin/radar/demand')->assertForbidden();
        $this->getJson('/api/admin/radar/targets/revisions')->assertForbidden();
    }

    // ── Le réglage ────────────────────────────────────────────────────────────────────────────

    public function test_celui_qui_allume_devient_l_operateur(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->getJson('/api/admin/radar/demand')->assertOk()->assertExactJson(['data' => [
            'enabled' => false, 'operator' => null, 'enabled_at' => null, 'blocked_reason' => 'radar.demand.disabled',
            'last_run_at' => null, 'last_run_outcome' => null, 'last_revision_at' => null, 'max_demand' => 20,
        ]]);

        $porteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->patchJson('/api/admin/radar/demand', ['enabled' => true])->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.operator.id', $porteur->id)
            ->assertJsonPath('data.enabled_at', now()->toIso8601String())
            ->assertJsonPath('data.blocked_reason', null);

        // Rallumer un réglage allumé ne change pas d'opérateur ; l'éteindre le garde affiché.
        $autre = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->patchJson('/api/admin/radar/demand', ['enabled' => true])->assertJsonPath('data.operator.id', $porteur->id);
        $this->patchJson('/api/admin/radar/demand', ['enabled' => false])
            ->assertJsonPath('data.enabled', false)
            ->assertJsonPath('data.operator.id', $porteur->id)
            ->assertJsonPath('data.blocked_reason', 'radar.demand.disabled');

        // Rallumer un réglage éteint : l'appelant devient l'opérateur.
        $this->patchJson('/api/admin/radar/demand', ['enabled' => true])->assertJsonPath('data.operator.id', $autre->id);

        // Un opérateur disparu : l'écran le dit, et rallumer le reprend.
        $troisieme = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $autre->delete();
        $this->getJson('/api/admin/radar/demand')->assertJsonPath('data.blocked_reason', 'radar.demand.operator_missing')
            ->assertJsonPath('data.operator', null);
        $this->patchJson('/api/admin/radar/demand', ['enabled' => true])->assertJsonPath('data.operator.id', $troisieme->id)
            ->assertJsonPath('data.blocked_reason', null);

        $this->patchJson('/api/admin/radar/demand', [])->assertUnprocessable()->assertJsonValidationErrors('enabled');
    }

    public function test_rafraichir_maintenant(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson('/api/admin/radar/demand/refresh')->assertStatus(409)->assertJsonPath('code', 'radar.demand.disabled');

        $this->patchJson('/api/admin/radar/demand', ['enabled' => true]);
        Queue::fake();
        $this->postJson('/api/admin/radar/demand/refresh')->assertStatus(202)->assertJsonPath('data.enabled', true);
        Queue::assertPushedOn('ai', RefreshRadarDemandTargets::class);
    }

    public function test_rafraichir_joue_un_passage(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        SavedSearch::factory()->create(['criteria' => ['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent'], 'results_count' => 0]);
        $this->fakeCreate();
        $this->patchJson('/api/admin/radar/demand', ['enabled' => true]);

        // La suite joue la file en synchrone : le passage a eu lieu quand la réponse part.
        $this->postJson('/api/admin/radar/demand/refresh')->assertStatus(202)
            ->assertJsonPath('data.last_run_outcome', RadarDemandCurator::OUTCOME_APPLIED)
            ->assertJsonPath('data.last_revision_at', now()->toIso8601String());
        $this->assertSame(1, RadarTarget::query()->where('origin', RadarTargetOrigin::Demand->value)->count());
    }

    public function test_la_commande_planifiee_met_un_passage_en_file(): void
    {
        Queue::fake();

        $this->assertSame(0, Artisan::call('radar:refresh-demand-targets'));

        Queue::assertPushedOn('ai', RefreshRadarDemandTargets::class);
    }

    // ── Les révisions ─────────────────────────────────────────────────────────────────────────

    public function test_l_historique_rend_les_operations_et_leur_motif(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $revision = $this->revision();
        $target = RadarTarget::query()->sole();

        $this->getJson('/api/admin/radar/targets/revisions?include=revertedBy')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $revision->id)
            ->assertJsonPath('data.0.operations.0.op', 'create')
            ->assertJsonPath('data.0.operations.0.target_id', $target->id)
            ->assertJsonPath('data.0.operations.0.name', 'Appartements à louer, Almadies')
            ->assertJsonPath('data.0.operations.0.reason', 'Deux recherches sans résultat.')
            ->assertJsonPath('data.0.operations.0.signal_refs', ['d1'])
            ->assertJsonPath('data.0.operations.0.criteria.contract', 'rent')
            ->assertJsonPath('data.0.discarded', [])
            ->assertJsonPath('data.0.before', [['id' => $target->id, 'created' => true]])
            ->assertJsonPath('data.0.signals_count', 1)
            ->assertJsonPath('data.0.reverted_at', null)
            ->assertJsonPath('data.0.reverted_by', null)
            ->assertJsonMissingPath('data.0.signals_signature');

        $this->getJson('/api/admin/radar/targets/revisions?fields[radar_target_revisions]=id,created_at')->assertOk()
            ->assertExactJson(['data' => [['id' => $revision->id, 'created_at' => now()->toIso8601String()]],
                'meta' => ['total' => 1, 'per_page' => 15, 'current_page' => 1, 'last_page' => 1]]);
    }

    public function test_defaire_par_l_api(): void
    {
        $porteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $revision = $this->revision();
        $target = RadarTarget::query()->sole();

        $this->postJson("/api/admin/radar/targets/revisions/{$revision->id}/revert")->assertOk()
            ->assertJsonPath('data.id', $revision->id)
            ->assertJsonPath('data.reverted_at', now()->toIso8601String())
            ->assertJsonPath('data.reverted_by_id', $porteur->id);
        $this->assertSame(RadarTargetStatus::Retired, $target->fresh()->status);

        $this->postJson("/api/admin/radar/targets/revisions/{$revision->id}/revert")->assertStatus(409)
            ->assertJsonPath('code', 'radar.targets.revision_reverted');
        $this->postJson('/api/admin/radar/targets/revisions/999999/revert')->assertNotFound();
    }

    public function test_defaire_une_revision_depassee_rend_409(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $first = $this->revision();
        $target = RadarTarget::query()->sole();
        RadarTargetRevision::query()->create([
            'operations' => [], 'before' => [['id' => $target->id, 'name' => 'x', 'status' => 'active', 'pinned' => false, 'criteria' => [], 'demand_count' => 0]],
            'signals_signature' => str_repeat('b', 64),
        ]);

        $this->postJson("/api/admin/radar/targets/revisions/{$first->id}/revert")->assertStatus(409)
            ->assertJsonPath('code', 'radar.targets.revision_superseded');
        $this->assertSame(RadarTargetStatus::Active, $target->fresh()->status);
    }
}
