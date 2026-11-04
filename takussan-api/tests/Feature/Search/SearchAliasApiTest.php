<?php

namespace Tests\Feature\Search;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\SearchAlias;
use App\Models\SearchAliasSetting;
use App\Services\Search\Query\SearchQueryParser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2476 (ADR-0088 §7) — `GET /api/admin/search/aliases` et `PATCH /api/admin/search/aliases/{alias}` : lire les
 * variantes, les trancher. `super_admin` seul ; un geste d'opérateur rend la variante `manual`, et se lit dès la requête
 * suivante.
 */
class SearchAliasApiTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private string $url = '/api/admin/search/aliases';

    private SearchAlias $wakam;

    protected function setUp(): void
    {
        parent::setUp();
        SearchAlias::forgetCaches();
        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Ouakam', 'slug' => 'ouakam']);

        $this->wakam = SearchAlias::query()->create(['alias' => 'wakam', 'target_kind' => 'neighborhood', 'target_value' => 'Ouakam',
            'target_city' => 'Dakar', 'origin' => 'ai', 'status' => 'active', 'evidence' => ['visitors' => 4, 'queries' => 2]]);
        SearchAlias::query()->create(['alias' => 'aprt', 'target_kind' => 'property_type', 'target_value' => 'apartment', 'origin' => 'manual', 'status' => 'active']);
        SearchAlias::query()->create(['alias' => 'oukam', 'target_kind' => 'neighborhood', 'target_value' => 'Ouakam', 'origin' => 'ai', 'status' => 'rejected']);
    }

    public function test_un_super_admin_liste_et_filtre_par_statut_et_origine(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $all = $this->getJson($this->url)->assertOk();
        $this->assertSame(3, $all->json('meta.total'));
        $this->assertSame(
            ['id', 'alias', 'target_kind', 'target_value', 'target_city', 'origin', 'status', 'evidence', 'created_at', 'updated_at'],
            array_keys($all->json('data.0')),
        );

        $this->assertSame(['oukam'], array_column($this->getJson($this->url.'?filter[status]=rejected')->assertOk()->json('data'), 'alias'));
        $this->assertSame(['aprt'], array_column($this->getJson($this->url.'?filter[origin]=manual')->assertOk()->json('data'), 'alias'));
        $this->assertSame(['wakam'], array_column($this->getJson($this->url.'?filter[status]=active&filter[origin]=ai')->json('data'), 'alias'));
        $this->getJson($this->url.'?filter[status]=perdu')->assertUnprocessable();
    }

    public function test_trancher_une_variante_la_rend_manuelle_et_se_lit_aussitot(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->assertSame('Ouakam', app(SearchQueryParser::class)->parse('wakam', 'fr')->criteria['location'] ?? null);

        $this->patchJson($this->url.'/'.$this->wakam->id, ['status' => 'rejected'])->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.origin', 'manual');

        $this->assertSame([], app(SearchQueryParser::class)->parse('wakam', 'fr')->criteria, 'le cache de l\'analyse est vidé');
        $this->assertDatabaseHas('activity_log', ['event' => 'search_alias_updated', 'subject_id' => $this->wakam->id]);
    }

    public function test_un_statut_inconnu_est_refuse(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->patchJson($this->url.'/'.$this->wakam->id, ['status' => 'perdu'])->assertUnprocessable();
        $this->patchJson($this->url.'/'.$this->wakam->id, [])->assertUnprocessable();
    }

    // ── Le réglage (revue adverse du 2026-11-04, 13a) ────────────────────────────────────────────

    public function test_le_reglage_se_lit_eteint_et_sans_operateur(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->getJson($this->url.'/settings')->assertOk()
            ->assertExactJson(['data' => [
                'enabled' => false,
                'operator' => null,
                'enabled_at' => null,
                'blocked_reason' => SearchAliasSetting::BLOCKED_DISABLED,
                'last_run_at' => null,
                'last_run_outcome' => null,
            ]]);
    }

    /** Celui qui allume devient l'opérateur ; un second « allumer » ne le lui prend pas ; éteindre le garde affiché. */
    public function test_celui_qui_allume_devient_l_operateur(): void
    {
        $first = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->patchJson($this->url.'/settings', ['enabled' => true])->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.operator.id', $first->id)
            ->assertJsonPath('data.blocked_reason', null);
        $this->assertDatabaseHas('activity_log', ['event' => 'search_alias_settings_updated', 'causer_id' => $first->id]);

        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->patchJson($this->url.'/settings', ['enabled' => true])->assertOk()->assertJsonPath('data.operator.id', $first->id);
        $this->patchJson($this->url.'/settings', ['enabled' => false])->assertOk()
            ->assertJsonPath('data.enabled', false)
            ->assertJsonPath('data.operator.id', $first->id)
            ->assertJsonPath('data.blocked_reason', SearchAliasSetting::BLOCKED_DISABLED);
    }

    /** Allumé mais son opérateur disparu : rallumer le reprend, sans l'éteindre d'abord. */
    public function test_rallumer_reprend_un_reglage_dont_l_operateur_a_disparu(): void
    {
        $first = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->patchJson($this->url.'/settings', ['enabled' => true])->assertOk();
        $first->platformProfile()->update(['revoked_at' => now()]);

        $second = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->getJson($this->url.'/settings')->assertOk()->assertJsonPath('data.blocked_reason', SearchAliasSetting::BLOCKED_OPERATOR_MISSING);
        $this->patchJson($this->url.'/settings', ['enabled' => true])->assertOk()
            ->assertJsonPath('data.operator.id', $second->id)
            ->assertJsonPath('data.blocked_reason', null);
    }

    public function test_le_reglage_refuse_une_valeur_absente_ou_invalide(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->patchJson($this->url.'/settings', [])->assertUnprocessable();
        $this->patchJson($this->url.'/settings', ['enabled' => 'peut-etre'])->assertUnprocessable();
        $this->assertFalse(SearchAliasSetting::current()->enabled);
    }

    public function test_sous_le_super_admin_tout_est_refuse(): void
    {
        foreach ([PlatformProfileLevel::Viewer, PlatformProfileLevel::Support] as $level) {
            $this->agirEnOperateur($level);
            $this->getJson($this->url)->assertForbidden();
            $this->patchJson($this->url.'/'.$this->wakam->id, ['status' => 'rejected'])->assertForbidden();
            $this->getJson($this->url.'/settings')->assertForbidden();
            $this->patchJson($this->url.'/settings', ['enabled' => true])->assertForbidden();
        }
        $this->assertSame('active', $this->wakam->fresh()->status->value);
        $this->assertFalse(SearchAliasSetting::current()->enabled);
    }

    /** La garde de l'espace `/api/admin` (TCK-144) : un admin d'agence est refusé, la variante liée existe (pas un 404). */
    public function test_un_admin_d_agence_est_refuse(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson($this->url)->assertForbidden();
        $this->patchJson($this->url.'/'.$this->wakam->id, ['status' => 'rejected'])->assertForbidden();
        $this->getJson($this->url.'/settings')->assertForbidden();
        $this->patchJson($this->url.'/settings', ['enabled' => true])->assertForbidden();
    }
}
