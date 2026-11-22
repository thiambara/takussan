<?php

namespace Tests\Feature\Search;

use App\Ai\Agents\SearchAliasProposals;
use App\Jobs\Search\RefreshSearchAliases;
use App\Models\AiCall;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\SearchAliasOrigin;
use App\Models\Enums\SearchAliasStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\SearchAlias;
use App\Models\SearchAliasSetting;
use App\Models\SearchQueryStat;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Search\Aliases\SearchAliasCurator;
use App\Services\Search\Query\DatabasePlaceLexicon;
use App\Services\Search\Query\SearchQueryParser;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2476 (ADR-0088 §7) — un passage des variantes d'écriture, la passerelle RÉELLE et l'agent doublé
 * (`SearchAliasProposals::fake()`) : le modèle propose, le code valide — cible qui existe, écriture lue dans une saisie,
 * jamais une variante rejetée rouverte, jamais une variante d'opérateur touchée.
 */
class SearchAliasCuratorTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase, SocleIaDEssai;

    private User $operator;

    /** Les entrées reçues par le modèle, dans l'ordre des appels. @var list<string> */
    private array $prompts = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
        $this->installerSocleDEssai();
        // Le catalogue et les prompts RÉELS : c'est l'usage livré qu'on éprouve.
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);
        Cache::forget(SearchAliasCurator::SIGNATURE_KEY);
        SearchAlias::forgetCaches();

        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Ouakam', 'slug' => 'ouakam']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Almadies', 'slug' => 'almadies']);

        $this->operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
    }

    // ── Aides ─────────────────────────────────────────────────────────────────────────────────

    /** @param  list<array<string, mixed>>  ...$responses  une réponse (`aliases`) par appel, dans l'ordre */
    private function model(array ...$responses): void
    {
        $this->prompts = [];
        SearchAliasProposals::fake(function (string $prompt) use (&$responses) {
            $this->prompts[] = $prompt;

            return ['aliases' => array_shift($responses) ?? []];
        });
    }

    /** Une saisie sans résultat du journal, portée par `$visitors` visiteurs distincts aujourd'hui. */
    private function journal(?string $q, int $visitors, array $criteria = [], int $lastResults = 0): void
    {
        SearchQueryStat::query()->create([
            'day' => now()->toDateString(),
            'query_key' => hash('sha256', $q.json_encode($criteria)),
            'normalized_query' => $q,
            'criteria' => $criteria,
            'searches_count' => $visitors,
            'distinct_visitors' => $visitors,
            'zero_results_count' => $lastResults === 0 ? $visitors : 0,
            'last_results_count' => $lastResults,
        ]);
    }

    /** @return array<string, mixed> */
    private static function proposal(string $alias, string $kind, string $value, ?string $city = null, float $confidence = 0.95): array
    {
        return ['alias' => $alias, 'target_kind' => $kind, 'target_value' => $value, 'target_city' => $city, 'confidence' => $confidence];
    }

    /** @return array{outcome: string, created: int, updated: int, discarded: list<array{alias: string, code: string}>} */
    private function pass(?User $operator = null): array
    {
        return app(SearchAliasCurator::class)->run($operator ?? $this->operator);
    }

    /** Le réglage allumé au nom de `$operator` (par défaut, l'opérateur du test). */
    private function allumer(?User $operator = null): SearchAliasSetting
    {
        $setting = SearchAliasSetting::current();
        $setting->forceFill(['enabled' => true, 'operator_id' => ($operator ?? $this->operator)->id, 'enabled_at' => now()])->save();

        return $setting;
    }

    // ── AC1 — une proposition vers un quartier inexistant n'est pas enregistrée ────────────────────

    public function test_ac1_une_variante_dont_la_cible_n_existe_pas_n_est_pas_enregistree(): void
    {
        $this->journal('appartement wakam', 3);
        $this->journal('villa keur massar', 2);
        $this->model([
            self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar'),
            self::proposal('keur massar', 'neighborhood', 'Keur Massar', 'Dakar'),
            self::proposal('massar', 'city', 'Massar'),
            self::proposal('wakam', 'neighborhood', 'Ouakam', 'Thiès'),
            self::proposal('villa', 'property_type', 'chateau'),
            self::proposal('villa', 'term', 'jacuzzi'),
        ]);

        $result = $this->pass();

        $this->assertSame(SearchAliasCurator::OUTCOME_APPLIED, $result['outcome']);
        $this->assertSame([['wakam', 'neighborhood', 'Ouakam', 'Dakar']], SearchAlias::query()->get()
            ->map(fn (SearchAlias $a) => [$a->alias, $a->target_kind->value, $a->target_value, $a->target_city])->all());
        $this->assertDatabaseMissing('search_aliases', ['target_value' => 'Keur Massar']);
        $this->assertSame(array_fill(0, 5, SearchAliasCurator::DISCARD_TARGET_UNKNOWN), array_column($result['discarded'], 'code'));
    }

    public function test_la_variante_retenue_porte_ses_preuves_et_sa_cible_ecrite_comme_le_referentiel(): void
    {
        $this->journal('appartement wakam', 3);
        $this->journal('wakam meuble', 2);
        $this->model([self::proposal('Wakam', 'neighborhood', 'ouakam', null, 0.9)]);

        $this->pass();

        $alias = SearchAlias::query()->sole();
        $this->assertSame('wakam', $alias->alias, 'repliée');
        $this->assertSame('Ouakam', $alias->target_value, 'le nom du référentiel');
        $this->assertSame('Dakar', $alias->target_city, 'la ville du quartier, déduite');
        $this->assertSame(SearchAliasOrigin::Ai, $alias->origin);
        $this->assertSame(SearchAliasStatus::Active, $alias->status);
        $this->assertSame(5, $alias->evidence['visitors']);
        $this->assertSame(2, $alias->evidence['queries']);
        $this->assertSame(now()->toDateString(), $alias->evidence['period']['to']);
        $this->assertSame(0.9, $alias->evidence['confidence']);
        $this->assertSame(AiCall::query()->sole()->id, $alias->evidence['ai_call_id']);
    }

    // ── AC2 — une variante rejetée n'est pas recréée au passage suivant ───────────────────────────

    public function test_ac2_une_variante_rejetee_n_est_pas_recreee_au_passage_suivant(): void
    {
        $this->journal('appartement wakam', 3);
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')], [self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);
        $this->pass();
        $alias = SearchAlias::query()->sole();
        // L'opérateur la rejette (geste de la console : elle devient `manual`).
        $alias->forceFill(['status' => SearchAliasStatus::Rejected, 'origin' => SearchAliasOrigin::Manual])->save();

        // La demande change (le passage suivant rappelle le modèle), qui repropose la même variante.
        $this->journal('studio wakam', 2);
        $result = $this->pass();

        $this->assertCount(2, $this->prompts, 'le second passage a bien appelé le modèle');
        $this->assertSame(1, SearchAlias::query()->count());
        $this->assertSame(SearchAliasStatus::Rejected, $alias->fresh()->status);
        $this->assertSame([SearchAliasCurator::DISCARD_REJECTED], array_column($result['discarded'], 'code'));
    }

    public function test_une_variante_rejetee_par_l_ia_elle_meme_n_est_jamais_rouverte(): void
    {
        SearchAlias::query()->create(['alias' => 'wakam', 'target_kind' => 'neighborhood', 'target_value' => 'Ouakam',
            'target_city' => 'Dakar', 'origin' => 'ai', 'status' => 'rejected', 'evidence' => ['visitors' => 1]]);
        $this->journal('appartement wakam', 3);
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);

        $result = $this->pass();

        $alias = SearchAlias::query()->sole();
        $this->assertSame(SearchAliasStatus::Rejected, $alias->status);
        $this->assertSame(['visitors' => 1], $alias->evidence, 'ses preuves ne bougent pas');
        $this->assertSame([SearchAliasCurator::DISCARD_REJECTED], array_column($result['discarded'], 'code'));
    }

    public function test_une_variante_manuelle_n_est_jamais_modifiee_par_l_ia(): void
    {
        $manual = SearchAlias::query()->create(['alias' => 'wakam', 'target_kind' => 'neighborhood', 'target_value' => 'Ouakam',
            'target_city' => 'Dakar', 'origin' => 'manual', 'status' => 'active', 'evidence' => null]);
        $updatedAt = $manual->updated_at;
        // La variante active rend « wakam » compris : seule une saisie qui garde un mot inconnu est encore envoyée.
        $this->journal('appartement wakam lumineux', 3);
        $this->travel(5)->minutes();
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);

        $result = $this->pass();

        $fresh = $manual->fresh();
        $this->assertSame(SearchAliasOrigin::Manual, $fresh->origin);
        $this->assertNull($fresh->evidence);
        $this->assertEquals($updatedAt, $fresh->updated_at);
        $this->assertSame([SearchAliasCurator::DISCARD_MANUAL], array_column($result['discarded'], 'code'));
    }

    public function test_une_variante_de_l_ia_encore_proposee_met_a_jour_ses_preuves_sans_doublon(): void
    {
        $this->journal('appartement wakam', 3);
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')], [self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);
        $this->pass();
        // « wakam » est désormais compris : seule une saisie qui garde un mot inconnu est encore envoyée.
        $this->journal('studio wakam lumineux', 4);

        $result = $this->pass();

        $this->assertSame(['created' => 0, 'updated' => 1], ['created' => $result['created'], 'updated' => $result['updated']]);
        $this->assertSame(4, SearchAlias::query()->sole()->evidence['visitors'], 'les saisies du passage');
    }

    // ── Le code valide ─────────────────────────────────────────────────────────────────────────

    public function test_une_ecriture_absente_des_saisies_deja_comprise_ou_peu_sure_est_ecartee(): void
    {
        $this->journal('appartement wakam', 3);
        $this->journal('aprt clime almadies', 2);
        $this->journal('apt meuble', 2);
        $this->model([
            self::proposal('ouakame', 'neighborhood', 'Ouakam', 'Dakar'),       // écrite nulle part
            self::proposal('almadies', 'neighborhood', 'Almadies', 'Dakar'),    // le nom même
            self::proposal('appartement', 'property_type', 'apartment'),        // déjà un mot du vocabulaire
            self::proposal('clime', 'term', 'climatisation', null, 0.4),        // peu sûre
            self::proposal('', 'city', 'Dakar'),                                 // vide
            self::proposal('apt', 'property_type', 'apartment'),                // deux cibles pour une écriture :
            self::proposal('apt', 'term', 'meuble'),                            //   ni l'une ni l'autre
            self::proposal('aprt', 'property_type', 'apartment'),               // retenue
            self::proposal('aprt', 'property_type', 'apartment'),               // proposée deux fois
        ]);

        $result = $this->pass();

        $this->assertSame([
            SearchAliasCurator::DISCARD_NOT_IN_QUERIES, SearchAliasCurator::DISCARD_ALREADY_UNDERSTOOD,
            SearchAliasCurator::DISCARD_ALREADY_UNDERSTOOD, SearchAliasCurator::DISCARD_LOW_CONFIDENCE,
            SearchAliasCurator::DISCARD_INVALID, SearchAliasCurator::DISCARD_DUPLICATE, SearchAliasCurator::DISCARD_DUPLICATE,
            SearchAliasCurator::DISCARD_DUPLICATE,
        ], array_column($result['discarded'], 'code'));
        $this->assertEqualsCanonicalizing(
            [['aprt', 'property_type', 'apartment']],
            SearchAlias::query()->get()->map(fn (SearchAlias $a) => [$a->alias, $a->target_kind->value, $a->target_value])->all(),
        );
    }

    /**
     * Revue adverse n° 3 (2026-11-04) — une variante de l'IA est créée ACTIVE sans relecture : sur un mot courant
     * (« proche » → Almadies), elle détournait toute saisie qui le porte (« maison proche ecole ouakam » se lisait
     * Almadies). Le code exige désormais une écriture PROCHE de sa cible (faute, phonétique simple, abréviation), et
     * refuse un mot courant ou le nom d'une autre cible.
     */
    public function test_une_variante_sur_un_mot_courant_ou_loin_de_sa_cible_est_ecartee(): void
    {
        $this->journal('villa proche plage', 3);
        $this->journal('appartement proche mer', 2);
        $this->journal('maison sicap complexe', 2);
        $this->journal('studio wakam', 2);
        $this->journal('aprt clime almadies', 2);
        $this->model([
            self::proposal('proche', 'neighborhood', 'Almadies', 'Dakar', 0.9),     // mot courant
            self::proposal('plage', 'neighborhood', 'Almadies', 'Dakar', 0.9),      // mot courant
            self::proposal('proche plage', 'neighborhood', 'Almadies', 'Dakar'),    // fait de mots courants
            self::proposal('complexe', 'neighborhood', 'Ouakam', 'Dakar'),          // le libellé d'un type (« Complexe »)
            self::proposal('sicap', 'neighborhood', 'Almadies', 'Dakar'),           // sans rapport avec la cible
            self::proposal('sicap', 'property_type', 'villa'),                       // idem, et proposée deux fois
            self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar'),             // ou ↔ w : gardée
            self::proposal('aprt', 'property_type', 'apartment'),                    // abréviation : gardée
            self::proposal('clime', 'term', 'climatisation'),                        // proche de « clim » : gardée
        ]);

        $result = $this->pass();

        $this->assertSame([
            ['proche', SearchAliasCurator::DISCARD_COMMON_WORD],
            ['plage', SearchAliasCurator::DISCARD_COMMON_WORD],
            ['proche plage', SearchAliasCurator::DISCARD_COMMON_WORD],
            ['complexe', SearchAliasCurator::DISCARD_OTHER_TARGET],
            ['sicap', SearchAliasCurator::DISCARD_DUPLICATE],
            ['sicap', SearchAliasCurator::DISCARD_DUPLICATE],
        ], array_map(fn (array $d) => [$d['alias'], $d['code']], $result['discarded']));
        $this->assertEqualsCanonicalizing(
            [['wakam', 'Ouakam'], ['aprt', 'apartment'], ['clime', 'climatisation']],
            SearchAlias::query()->get()->map(fn (SearchAlias $a) => [$a->alias, $a->target_value])->all(),
        );
        $parsed = app(SearchQueryParser::class)->parse('maison proche ecole ouakam', 'fr');
        $this->assertSame('Ouakam', $parsed->criteria['location'] ?? null, 'le vrai lieu reste lu');
    }

    public function test_une_ecriture_sans_rapport_avec_sa_cible_est_ecartee(): void
    {
        $this->journal('maison sicap liberte', 3);
        $this->journal('villa ngr', 2);
        $this->model([
            self::proposal('sicap', 'neighborhood', 'Almadies', 'Dakar'),   // ni faute, ni phonétique, ni abréviation
            self::proposal('ngr', 'neighborhood', 'Ouakam', 'Dakar'),       // ne commence pas comme la cible
            self::proposal('liberte', 'property_type', 'villa'),
        ]);

        $result = $this->pass();

        $this->assertSame(array_fill(0, 3, SearchAliasCurator::DISCARD_NOT_CLOSE), array_column($result['discarded'], 'code'));
        $this->assertSame(0, SearchAlias::query()->count());
    }

    public function test_une_sortie_invalide_n_ecrit_rien(): void
    {
        $this->journal('appartement wakam', 3);
        SearchAliasProposals::fake(fn () => ['aliases' => 'rien']);

        $this->assertSame(SearchAliasCurator::OUTCOME_INVALID_OUTPUT, $this->pass()['outcome']);
        $this->assertSame(0, SearchAlias::query()->count());
    }

    // ── L'entrée du modèle et les appels évités ───────────────────────────────────────────────────

    public function test_l_entree_ne_porte_que_des_saisies_non_comprises_d_au_moins_deux_visiteurs_et_les_entites_connues(): void
    {
        $this->journal('appartement wakam', 3);
        $this->journal('studio sicap', 1);                                                  // un seul visiteur
        $this->journal('appartement almadies', 4);                                          // entièrement comprise
        $this->journal(null, 5, ['type' => 'villa', 'city' => 'Dakar']);                   // critères seuls
        $this->journal('maison wakam', 3, lastResults: 2);                                  // rend des résultats
        $this->model([]);

        $this->pass();

        $input = json_decode($this->prompts[0], true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(['queries', 'known'], array_keys($input));
        $this->assertSame([['q' => 'appartement wakam', 'visitors' => 3]], $input['queries']);
        $this->assertSame(['cities', 'neighborhoods', 'property_types', 'terms'], array_keys($input['known']));
        $this->assertContains(['name' => 'Ouakam', 'city' => 'Dakar'], $input['known']['neighborhoods']);
        $this->assertContains('Dakar', $input['known']['cities']);
        $this->assertContains('climatisation', $input['known']['terms']);
        $this->assertContains('apartment', array_column($input['known']['property_types'], 'value'));
    }

    public function test_les_memes_saisies_n_appellent_pas_le_modele_deux_fois(): void
    {
        $this->journal('appartement wakam', 3);
        $this->model([], []);

        $this->assertSame(SearchAliasCurator::OUTCOME_APPLIED, $this->pass()['outcome']);
        $this->assertSame(SearchAliasCurator::OUTCOME_UNCHANGED, $this->pass()['outcome']);
        $this->assertCount(1, $this->prompts);
    }

    public function test_sans_saisie_aucun_appel(): void
    {
        $this->model([]);

        $this->assertSame(SearchAliasCurator::OUTCOME_NO_SIGNALS, $this->pass()['outcome']);
        $this->assertSame([], $this->prompts);
        $this->assertSame(0, AiCall::query()->count());
    }

    // ── Le réglage `search_alias_settings` (revue adverse du 2026-11-04, 13a) ─────────────────────

    /** Éteint (son état à la migration), rien ne part — et plus aucun `super_admin` n'est choisi d'office. */
    public function test_eteint_aucun_passage_meme_avec_un_super_admin(): void
    {
        $this->journal('appartement wakam', 3);
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);

        $this->assertSame(SearchAliasSetting::BLOCKED_DISABLED, app(SearchAliasCurator::class)->run()['outcome']);
        $this->assertSame([], $this->prompts);
        $this->assertSame(0, AiCall::query()->count());
        $this->assertNull(SearchAliasSetting::current()->last_run_at, 'éteint : aucun passage, rien d\'inscrit');
    }

    public function test_allume_le_passage_part_au_nom_de_celui_qui_l_a_allume_et_s_inscrit(): void
    {
        $other = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->allumer($other);
        $this->journal('appartement wakam', 3);
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);

        $this->assertSame(SearchAliasCurator::OUTCOME_APPLIED, app(SearchAliasCurator::class)->run()['outcome']);
        $this->assertSame($other->id, AiCall::query()->sole()->actor_id);
        $setting = SearchAliasSetting::current();
        $this->assertSame(SearchAliasCurator::OUTCOME_APPLIED, $setting->last_run_outcome);
        $this->assertTrue($setting->last_run_at->equalTo(now()));
    }

    /** Opérateur disparu (privé du geste, ou supprimé) : aucun passage, l'issue le dit ; rien ne l'éteint d'office. */
    public function test_operateur_disparu_aucun_passage_et_l_issue_le_dit(): void
    {
        $this->allumer();
        $this->operator->platformProfile()->update(['revoked_at' => now()]);
        $this->journal('appartement wakam', 3);
        $this->model([]);

        $this->assertSame(SearchAliasSetting::BLOCKED_OPERATOR_MISSING, app(SearchAliasCurator::class)->run()['outcome']);
        $this->assertSame([], $this->prompts);
        $setting = SearchAliasSetting::current();
        $this->assertSame(SearchAliasSetting::BLOCKED_OPERATOR_MISSING, $setting->last_run_outcome);
        $this->assertTrue($setting->enabled);

        // Le geste rendu mais le compte supprimé (doux) : toujours disparu.
        $this->operator->platformProfile()->update(['revoked_at' => null]);
        $this->operator->delete();
        $this->assertSame(SearchAliasSetting::BLOCKED_OPERATOR_MISSING, app(SearchAliasCurator::class)->run()['outcome']);
        $this->assertSame([], $this->prompts);
    }

    public function test_un_operateur_qui_ne_regle_pas_la_plateforme_est_refuse_par_la_passerelle(): void
    {
        $support = $this->operateur(PlatformProfileLevel::Support);
        $this->journal('appartement wakam', 3);
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);

        $this->assertSame('ai.forbidden', $this->pass($support)['outcome']);
        $this->assertSame([], $this->prompts);
        $this->assertSame(AiCallOutcome::Refused, AiCall::query()->sole()->outcome);
        $this->assertSame(0, SearchAlias::query()->count());
    }

    // ── La commande et sa planification ─────────────────────────────────────────────────────────

    /** `--operator` : un lancement manuel, au nom de l'opérateur désigné, réglage éteint ou non. */
    public function test_la_commande_joue_un_passage_au_nom_de_l_operateur_designe(): void
    {
        $this->journal('appartement wakam', 3);
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);
        $this->assertFalse(SearchAliasSetting::current()->enabled);

        $this->assertSame(0, Artisan::call('search:refresh-aliases', ['--operator' => (string) $this->operator->id]));

        $this->assertSame($this->operator->id, AiCall::query()->sole()->actor_id);
        $this->assertSame(1, SearchAlias::query()->count());
        $this->assertSame(SearchAliasCurator::OUTCOME_APPLIED, SearchAliasSetting::current()->last_run_outcome);
    }

    public function test_la_commande_planifiee_ne_met_rien_en_file_si_le_reglage_est_eteint(): void
    {
        Queue::fake();

        $this->assertSame(0, Artisan::call('search:refresh-aliases'));
        Queue::assertNothingPushed();

        $this->allumer();
        $this->assertSame(0, Artisan::call('search:refresh-aliases'));
        Queue::assertPushed(RefreshSearchAliases::class, fn (RefreshSearchAliases $job) => $job->operatorId === null);
    }

    public function test_la_commande_planifiee_passe_au_nom_de_l_operateur_du_reglage(): void
    {
        $other = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->allumer($other);
        $this->journal('appartement wakam', 3);
        $this->model([self::proposal('wakam', 'neighborhood', 'Ouakam', 'Dakar')]);

        $this->assertSame(0, Artisan::call('search:refresh-aliases'));

        $this->assertSame($other->id, AiCall::query()->sole()->actor_id);
    }

    public function test_le_passage_est_planifie_chaque_semaine(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn ($e) => str_contains((string) $e->command, 'search:refresh-aliases'));

        $this->assertNotNull($event, 'planifié dans routes/console.php');
        $this->assertSame('10 4 * * 1', $event->expression);
    }
}
