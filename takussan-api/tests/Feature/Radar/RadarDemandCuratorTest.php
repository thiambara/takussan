<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarDemandTargets;
use App\Ai\Usages\RadarDemandTargetsUsage;
use App\Models\AiCall;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Profiles\PlatformProfile;
use App\Models\RadarDemandSetting;
use App\Models\RadarTarget;
use App\Models\RadarTargetRevision;
use App\Models\SavedSearch;
use App\Models\SearchQueryStat;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\Targets\RadarDemandCurator;
use App\Services\Radar\Targets\RadarDemandSignals;
use App\Services\Radar\Targets\RadarTargetCriteria;
use App\Services\Radar\Targets\RadarTargets;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2470 (ADR-0087 §6, ADR-0088 §4) — un passage des cibles de la demande, la passerelle RÉELLE et l'agent doublé
 * (`RadarDemandTargets::fake()`) : le modèle propose, le code valide, applique, révise ; « défaire » rend l'état d'avant.
 */
class RadarDemandCuratorTest extends TestCase
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

        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Almadies', 'slug' => 'almadies']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Ngor', 'slug' => 'ngor']);

        $this->operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
        RadarDemandSetting::current()->forceFill(['enabled' => true, 'operator_id' => $this->operator->id, 'enabled_at' => now()])->save();
    }

    // ── Aides ─────────────────────────────────────────────────────────────────────────────────

    /** @param  list<array<string, mixed>>  ...$responses  une réponse (`operations`) par appel, dans l'ordre */
    private function model(array ...$responses): void
    {
        $this->prompts = [];
        RadarDemandTargets::fake(function (string $prompt) use (&$responses) {
            $this->prompts[] = $prompt;

            return ['operations' => array_shift($responses) ?? []];
        });
    }

    /** @param  array<string, mixed>  $criteria */
    private function saved(array $criteria, array $attributes = []): SavedSearch
    {
        return SavedSearch::factory()->create(['criteria' => $criteria, 'results_count' => 0] + $attributes);
    }

    /** @param  array<string, mixed>  $criteria  forme de `SearchJournal::criteria()` */
    private function journal(array $criteria, int $visitors, ?string $q = null): void
    {
        SearchQueryStat::query()->create([
            'day' => now()->toDateString(),
            'query_key' => hash('sha256', $q.json_encode($criteria)),
            'normalized_query' => $q,
            'criteria' => $criteria,
            'searches_count' => $visitors,
            'distinct_visitors' => $visitors,
            'zero_results_count' => $visitors,
            'last_results_count' => 0,
        ]);
    }

    /** @param  array<string, mixed>  $criteria */
    private function target(string $name, array $criteria, RadarTargetOrigin $origin = RadarTargetOrigin::Demand, bool $pinned = false): RadarTarget
    {
        $normalized = RadarTargetCriteria::normalize($criteria);

        return RadarTarget::query()->create([
            'name' => $name, 'origin' => $origin, 'status' => RadarTargetStatus::Active, 'pinned' => $pinned,
            'criteria' => $normalized, 'criteria_signature' => RadarTargetCriteria::signature($normalized),
            'demand_count' => $origin === RadarTargetOrigin::Demand ? 1 : null,
        ]);
    }

    /**
     * Une opération proposée, sur le schéma de l'agent. Par défaut, elle cite les premiers signaux (`d1` à `d3`) : une
     * création, un réglage ou une fusion doit couvrir au moins l'un des signaux qu'elle cite (revue adverse, D3).
     *
     * @return array<string, mixed>
     */
    private static function op(string $op, array $criteria = [], ?int $targetId = null, array $mergeIds = [], string $name = '', array $refs = ['d1', 'd2', 'd3']): array
    {
        return [
            'op' => $op, 'target_id' => $targetId, 'merge_ids' => $mergeIds, 'name' => $name,
            'criteria' => $criteria + ['cities' => [], 'neighborhoods' => [], 'types' => [], 'contract' => null, 'price_min' => null,
                'price_max' => null, 'bedrooms_min' => null, 'bedrooms_max' => null, 'furnished' => null],
            'reason' => 'motif', 'signal_refs' => $refs,
        ];
    }

    private const ALMADIES = ['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']], 'types' => ['apartment'], 'contract' => 'rent', 'price_max' => 600_000];

    private const NGOR = ['neighborhoods' => [['name' => 'Ngor', 'city' => 'Dakar']], 'types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000];

    private function pass(): string
    {
        return app(RadarDemandCurator::class)->run();
    }

    /** @return list<RadarTarget> */
    private function activeDemand(): array
    {
        return RadarTarget::query()->where('origin', 'demand')->where('status', 'active')->orderBy('id')->get()->all();
    }

    // ── AC1 — deux recherches voisines + une ligne du journal, une fusion : UNE cible, demand_count = la somme ──

    public function test_une_fusion_rend_une_seule_cible_dont_le_compte_est_la_somme_des_signaux(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent', 'price_max' => 600000]);
        $this->saved(['location' => 'Ngor', 'type' => ['apartment'], 'contract_type' => 'rent', 'price_max' => 700000]);
        $this->model(
            // Deux signaux de même poids : leur rang (`d1`, `d2`) suit l'empreinte, pas l'ordre de saisie. Chacune cite les deux.
            [self::op('create', self::ALMADIES, name: 'F Almadies', refs: ['d1', 'd2']), self::op('create', self::NGOR, name: 'F Ngor', refs: ['d1', 'd2'])],
        );
        $this->assertSame(RadarDemandCurator::OUTCOME_APPLIED, $this->pass());
        [$almadies, $ngor] = $this->activeDemand();
        $this->assertSame([1, 1], [$almadies->demand_count, $ngor->demand_count]);

        // La demande change : une ligne du journal (3 visiteurs distincts) ; le modèle propose de fusionner.
        $this->journal(['cities' => 'Dakar', 'contract_type' => 'rent', 'price_max' => 650000, 'type' => 'apartment'], 3);
        $merged = ['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar'], ['name' => 'Ngor', 'city' => 'Dakar']],
            'types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000];
        $this->model([self::op('merge', $merged, $almadies->id, [$almadies->id, $ngor->id], 'Appartements à louer, Almadies et Ngor', ['d1', 'd2', 'd3'])]);
        $this->assertSame(RadarDemandCurator::OUTCOME_APPLIED, $this->pass());

        $active = $this->activeDemand();
        $this->assertCount(1, $active);
        $this->assertSame($almadies->id, $active[0]->id);
        $this->assertSame(5, $active[0]->demand_count, '1 + 1 recherches sauvegardées + 3 visiteurs');
        $this->assertSame(RadarTargetStatus::Retired, $ngor->fresh()->status);
        $this->assertFalse($active[0]->pinned, 'la révision par l\'IA n\'épingle pas la cible qu\'elle réécrit');
        $this->assertSame(2, RadarTargetRevision::query()->count());
    }

    // ── AC2 — une cible de l'opérateur ou épinglée n'est jamais touchée ─────────────────────────────

    public function test_une_operation_sur_une_cible_epinglee_ou_de_l_operateur_est_ecartee_et_consignee(): void
    {
        $operator = $this->target('Opérateur', self::ALMADIES, RadarTargetOrigin::Operator);
        $pinned = $this->target('Épinglée', self::NGOR, pinned: true);
        $free = $this->target('Libre', ['cities' => ['Dakar'], 'types' => ['villa']]);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([
            self::op('retire', targetId: $operator->id),
            self::op('retire', targetId: $pinned->id),
            self::op('update', ['cities' => ['Dakar']], $operator->id, name: 'Réécrite'),
            self::op('merge', ['cities' => ['Dakar']], $free->id, [$free->id, $pinned->id], 'Fusion'),
            self::op('retire', targetId: $free->id),
        ]);

        $this->pass();

        $this->assertSame(RadarTargetStatus::Active, $operator->fresh()->status);
        $this->assertSame('Opérateur', $operator->fresh()->name);
        $this->assertSame(RadarTargetStatus::Active, $pinned->fresh()->status);
        $this->assertSame('Ngor', $pinned->fresh()->criteria['neighborhoods'][0]['name']);
        $this->assertSame(RadarTargetStatus::Retired, $free->fresh()->status, 'l\'opération valide s\'applique');

        $revision = RadarTargetRevision::query()->sole();
        $this->assertSame(
            array_fill(0, 4, RadarDemandCurator::DISCARD_PROTECTED_TARGET),
            array_column($revision->discarded, 'code'),
        );
        $this->assertSame(['retire'], array_column($revision->operations, 'op'));
        $this->assertSame([$free->id], $revision->touchedTargetIds());
    }

    // ── Le code valide : critères, plafond, doublon ─────────────────────────────────────────────────

    public function test_une_operation_invalide_est_ecartee_et_les_autres_s_appliquent(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([
            self::op('create', ['types' => ['chateau']], name: 'Type inconnu'),
            self::op('create', [], name: 'Sans critère'),
            self::op('create', ['price_min' => 900, 'price_max' => 100], name: 'Fourchette'),
            self::op('create', self::ALMADIES, name: ''),
            self::op('demolish', self::ALMADIES, name: 'Inconnue'),
            self::op('update', self::NGOR, 999999, name: 'Absente'),
            self::op('create', self::ALMADIES, name: 'Valide'),
            self::op('create', self::ALMADIES, name: 'Doublon'),
        ]);

        $this->pass();

        $this->assertSame(['Valide'], array_map(fn (RadarTarget $t) => $t->name, $this->activeDemand()));
        $this->assertSame([
            'radar.targets.invalid_criteria', 'radar.targets.empty_criteria', 'radar.targets.invalid_range',
            RadarDemandCurator::DISCARD_INVALID_NAME, RadarDemandCurator::DISCARD_INVALID_OPERATION,
            RadarDemandCurator::DISCARD_UNKNOWN_TARGET, 'radar.targets.duplicate',
        ], array_column(RadarTargetRevision::query()->sole()->discarded, 'code'));
    }

    public function test_une_fusion_refusee_a_mi_chemin_ne_laisse_rien(): void
    {
        $a = $this->target('A', self::ALMADIES);
        $b = $this->target('B', self::NGOR);
        $dakar = ['cities' => ['Dakar'], 'types' => ['apartment'], 'contract' => 'rent'];
        $this->target('Opérateur', $dakar, RadarTargetOrigin::Operator);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        // B serait retirée, puis A réécrite en doublon de la cible de l'opérateur : refusé, B doit rester active.
        $this->model([self::op('merge', $dakar, $a->id, [$a->id, $b->id], 'Dakar')]);

        $this->pass();

        $this->assertSame(RadarTargetStatus::Active, $b->fresh()->status);
        $this->assertSame('A', $a->fresh()->name);
        $revision = RadarTargetRevision::query()->sole();
        $this->assertSame(['radar.targets.duplicate'], array_column($revision->discarded, 'code'));
        $this->assertSame([], $revision->before);
    }

    public function test_jamais_plus_de_max_demand_cibles_de_la_demande_actives(): void
    {
        config(['radar.targets.max_demand' => 2]);
        $this->target('Existante', ['cities' => ['Dakar'], 'types' => ['villa']]);
        $this->target('Opérateur', ['cities' => ['Dakar'], 'types' => ['land']], RadarTargetOrigin::Operator);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->saved(['location' => 'Ngor', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('create', self::ALMADIES, name: 'Deuxième'), self::op('create', self::NGOR, name: 'Troisième')]);

        $this->pass();

        $this->assertSame(['Existante', 'Deuxième'], array_map(fn (RadarTarget $t) => $t->name, $this->activeDemand()));
        $discarded = RadarTargetRevision::query()->sole()->discarded;
        $this->assertSame(RadarDemandCurator::DISCARD_TOO_MANY, $discarded[0]['code']);
        $this->assertSame(['max' => 2], $discarded[0]['params']);
    }

    // ── Pas de passage inutile, rien sans opérateur ──────────────────────────────────────────────

    public function test_des_signaux_inchanges_n_appellent_pas_le_modele_mais_recomptent(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent', 'price_max' => 600000]);
        $this->model([self::op('create', self::ALMADIES, name: 'Almadies')]);
        $this->pass();
        $this->assertCount(1, $this->prompts);
        $target = $this->activeDemand()[0];
        $target->forceFill(['demand_count' => 42])->save();

        // Une seconde recherche aux MÊMES critères : même groupe, même empreinte — le compte change, pas les signaux.
        $this->saved(['location' => 'almadies', 'type' => 'apartment', 'contract_type' => 'rent', 'price_max' => '600000']);
        $this->assertSame(RadarDemandCurator::OUTCOME_UNCHANGED, $this->pass());

        $this->assertCount(1, $this->prompts, 'aucun second appel');
        $this->assertSame(1, AiCall::query()->where('usage_key', RadarDemandTargetsUsage::KEY)->count());
        $this->assertSame(2, $target->fresh()->demand_count, 'recompté sans IA');
        $this->assertSame(1, RadarTargetRevision::query()->count());
    }

    public function test_sans_signal_aucun_appel(): void
    {
        $this->model();

        $this->assertSame(RadarDemandCurator::OUTCOME_NO_SIGNALS, $this->pass());
        RadarDemandTargets::assertNeverPrompted();
    }

    public function test_eteint_ou_sans_operateur_rien_ne_part(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment']]);
        $this->model();

        RadarDemandSetting::current()->forceFill(['enabled' => false])->save();
        $this->assertSame(RadarDemandSetting::BLOCKED_DISABLED, $this->pass());

        RadarDemandSetting::current()->forceFill(['enabled' => true])->save();
        PlatformProfile::query()->where('user_id', $this->operator->id)->delete();
        $this->assertSame(RadarDemandSetting::BLOCKED_OPERATOR_MISSING, $this->pass());

        $this->operator->delete();
        $this->assertSame(RadarDemandSetting::BLOCKED_OPERATOR_MISSING, $this->pass());

        RadarDemandTargets::assertNeverPrompted();
        $this->assertSame(0, AiCall::query()->count());
        $this->assertSame(RadarDemandSetting::BLOCKED_OPERATOR_MISSING, RadarDemandSetting::current()->last_run_outcome);
    }

    public function test_l_appel_part_au_nom_de_l_operateur(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment']]);
        $this->model([]);

        $this->pass();

        $call = AiCall::query()->sole();
        $this->assertSame([RadarDemandTargetsUsage::KEY, $this->operator->id, AiCallOutcome::Success], [$call->usage_key, $call->actor_id, $call->outcome]);
        $this->assertSame($call->id, RadarTargetRevision::query()->sole()->ai_call_id);
    }

    // ── AC4 — ni texte saisi par un visiteur, ni identifiant de compte dans l'entrée ─────────────

    public function test_l_entree_du_modele_ne_porte_ni_texte_saisi_ni_compte(): void
    {
        $owner = User::factory()->create(['email' => 'moussa.diop@example.sn', 'first_name' => 'Moussa', 'last_name' => 'Diop']);
        $this->saved(
            ['q' => 'villa de Moussa Diop 77 123 45 67', 'location' => 'Almadies', 'type' => ['villa'], 'tags' => ['piscine-de-awa'],
                'lat' => null, 'contract_type' => 'sale'],
            ['user_id' => $owner->id, 'name' => 'Recherche secrète de Moussa'],
        );
        // Un lieu inconnu du référentiel : le signal entier est écarté, le texte ne sort pas.
        $this->saved(['location' => 'Chez Tata Awa', 'type' => ['apartment']], ['user_id' => $owner->id]);
        $this->journal(['contract_type' => 'rent', 'type' => 'apartment', 'cities' => 'Dakar'], 4, 'appart chez fatou ndiaye');
        $this->journal(['contract_type' => 'rent', 'location' => 'Keur Fatou'], 6);
        $this->model([]);

        $this->pass();

        $prompt = $this->prompts[0] ?? '';
        foreach (['Moussa', 'Diop', '77 123', 'secrète', 'piscine', 'Tata', 'fatou', 'Fatou', 'moussa.diop', '"q"', 'user'] as $forbidden) {
            $this->assertStringNotContainsStringIgnoringCase($forbidden, $prompt, "« {$forbidden} » est sorti vers le modèle");
        }
        $input = json_decode($prompt, true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(['limits', 'signals', 'targets'], array_keys($input));
        $this->assertCount(2, $input['signals'], 'deux signaux reconnus, deux écartés');
        foreach ($input['signals'] as $signal) {
            $this->assertSame(['ref', 'count', 'sources', 'criteria'], array_keys($signal));
            $this->assertSame([], array_diff(array_keys($signal['criteria']), RadarDemandTargets::CRITERIA_KEYS));
        }
        $this->assertSame([['name' => 'Almadies', 'city' => 'Dakar']], $input['signals'][1]['criteria']['neighborhoods'], 'le nom du référentiel, pas la saisie');
    }

    public function test_une_recherche_sans_critere_structure_n_est_pas_un_signal(): void
    {
        $this->journal([], 9, 'appart almadies');

        $collected = app(RadarDemandSignals::class)->collect();

        $this->assertSame([], $collected['signals'], 'la saisie normalisée n\'est jamais lue');
        $this->assertSame(1, $collected['excluded']);
    }

    // ── AC3 — défaire ─────────────────────────────────────────────────────────────────────────────

    public function test_defaire_rend_les_cibles_touchees_a_leur_etat_d_avant(): void
    {
        $a = $this->target('A', self::ALMADIES);
        $b = $this->target('B', self::NGOR);
        $c = $this->target('C', ['cities' => ['Dakar'], 'types' => ['land']]);
        $before = collect([$a, $b, $c])->mapWithKeys(fn (RadarTarget $t) => [$t->id => $t->fresh()->only(['name', 'status', 'criteria', 'criteria_signature', 'pinned'])]);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->saved(['location' => 'Almadies', 'type' => ['villa']]);
        $merged = ['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar'], ['name' => 'Ngor', 'city' => 'Dakar']], 'types' => ['apartment'], 'contract' => 'rent'];
        $this->model([
            self::op('merge', $merged, $a->id, [$a->id, $b->id], 'Fusion'),
            self::op('retire', targetId: $c->id),
            self::op('create', ['cities' => ['Dakar'], 'types' => ['villa']], name: 'Nouvelle'),
        ]);
        $this->pass();
        $revision = RadarTargetRevision::query()->sole();
        $created = RadarTarget::query()->where('name', 'Nouvelle')->sole();
        $this->assertSame('Fusion', $a->fresh()->name);

        app(RadarDemandCurator::class)->revert($revision, $this->operator);

        foreach ($before as $id => $state) {
            $this->assertSame($state, RadarTarget::query()->find($id)->only(['name', 'status', 'criteria', 'criteria_signature', 'pinned']), "cible {$id}");
        }
        $this->assertSame(RadarTargetStatus::Retired, $created->fresh()->status, 'une cible créée est retirée, jamais effacée');
        $this->assertNotNull($revision->fresh()->reverted_at);
        $this->assertSame($this->operator->id, $revision->fresh()->reverted_by_id);
    }

    public function test_defaire_une_revision_depassee_est_refuse(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('create', self::ALMADIES, name: 'Almadies')]);
        $this->pass();
        $first = RadarTargetRevision::query()->sole();
        $target = $this->activeDemand()[0];

        $this->saved(['location' => 'Ngor', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('update', ['cities' => ['Dakar'], 'types' => ['apartment'], 'contract' => 'rent'], $target->id, name: 'Dakar')]);
        $this->pass();
        $second = RadarTargetRevision::query()->orderByDesc('id')->first();

        $this->assertRefused(fn () => app(RadarDemandCurator::class)->revert($first, $this->operator), 409, 'radar.targets.revision_superseded');
        $this->assertNull($first->fresh()->reverted_at);
        $this->assertSame('Dakar', $target->fresh()->name);

        // La plus récente d'abord, puis la première : chacune se défait.
        app(RadarDemandCurator::class)->revert($second, $this->operator);
        $this->assertSame('Almadies', $target->fresh()->name);
        app(RadarDemandCurator::class)->revert($first, $this->operator);
        $this->assertSame(RadarTargetStatus::Retired, $target->fresh()->status);
        $this->assertRefused(fn () => app(RadarDemandCurator::class)->revert($first, $this->operator), 409, 'radar.targets.revision_reverted');
    }

    public function test_defaire_ne_reprend_pas_une_cible_que_l_operateur_a_epinglee_depuis(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('create', self::ALMADIES, name: 'Almadies')]);
        $this->pass();
        $target = $this->activeDemand()[0];
        $target->forceFill(['pinned' => true])->save();

        $this->assertRefused(fn () => app(RadarDemandCurator::class)->revert(RadarTargetRevision::query()->sole(), $this->operator), 409, 'radar.targets.revision_superseded');
        $this->assertSame(RadarTargetStatus::Active, $target->fresh()->status);
    }

    public function test_une_revision_defaite_n_est_pas_refaite_tant_que_la_demande_ne_change_pas(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('create', self::ALMADIES, name: 'Almadies')]);
        $this->pass();
        app(RadarDemandCurator::class)->revert(RadarTargetRevision::query()->sole(), $this->operator);

        $this->assertSame(RadarDemandCurator::OUTCOME_UNCHANGED, $this->pass());
        $this->assertCount(1, $this->prompts);
        $this->assertSame([], $this->activeDemand());
    }

    // ── La couverture d'un signal ─────────────────────────────────────────────────────────────────

    public function test_une_cible_couvre_les_signaux_qui_la_recoupent(): void
    {
        $target = RadarTargetCriteria::normalize(['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']], 'types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000]);
        $signal = fn (array $c) => RadarTargetCriteria::normalize($c);

        $this->assertTrue(RadarDemandSignals::covers($target, $signal(['cities' => ['Dakar'], 'contract' => 'rent'])));
        $this->assertTrue(RadarDemandSignals::covers($target, $signal(['neighborhoods' => [['name' => 'ALMADIES', 'city' => 'dakar']], 'price_min' => 500_000])));
        $this->assertTrue(RadarDemandSignals::covers($target, $signal(['types' => ['apartment', 'villa']])));
        $this->assertFalse(RadarDemandSignals::covers($target, $signal(['contract' => 'sale'])));
        $this->assertFalse(RadarDemandSignals::covers($target, $signal(['types' => ['land']])));
        $this->assertFalse(RadarDemandSignals::covers($target, $signal(['price_min' => 800_000])));
        $this->assertFalse(RadarDemandSignals::covers($target, $signal(['neighborhoods' => [['name' => 'Ngor', 'city' => 'Dakar']]])));
        $this->assertFalse(RadarDemandSignals::covers($target, $signal(['cities' => ['Thiès']])));
    }

    // ── Revue adverse du 2026-11-04 ──────────────────────────────────────────────────────────────

    /**
     * D3 — une cible doit couvrir au moins l'un des signaux qu'elle cite. Sans cela, une cible `{furnished: true}` (aucun
     * critère qu'une carte puisse contredire) ouvrait tout le site à une source ciblée.
     */
    public function test_d3_une_cible_qui_ne_couvre_aucun_des_signaux_cites_est_ecartee(): void
    {
        $existante = $this->target('Existante', self::ALMADIES);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $villa = ['cities' => ['Mbour'], 'types' => ['villa'], 'contract' => 'sale'];
        $this->model([
            self::op('create', ['furnished' => true], name: 'Fourre-tout', refs: []),
            self::op('create', $villa, name: 'Sans lien', refs: ['d1']),
            self::op('create', self::NGOR, name: 'Référence inconnue', refs: ['d99']),
            self::op('update', $villa, $existante->id, name: 'Réglée sans lien', refs: ['d1']),
            self::op('create', ['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']], 'types' => ['apartment'], 'contract' => 'rent'], name: 'Couverte', refs: ['d1']),
        ]);

        $this->pass();

        $this->assertSame(['Existante', 'Couverte'], array_map(fn (RadarTarget $t) => $t->name, $this->activeDemand()));
        $this->assertSame('Existante', $existante->fresh()->name);
        $revision = RadarTargetRevision::query()->sole();
        $this->assertSame(array_fill(0, 4, RadarDemandCurator::DISCARD_UNCOVERED), array_column($revision->discarded, 'code'));
        $this->assertSame(['create'], array_column($revision->operations, 'op'));
    }

    /** D5 — « défaire » ne remet pas active une cible que l'opérateur a retirée depuis (retirer n'épingle pas). */
    public function test_d5_defaire_est_refuse_si_l_operateur_a_retire_une_cible_touchee(): void
    {
        $this->defaireApresUnGesteDeLOperateur(RadarTargetStatus::Retired);
    }

    /** D5 — ni une cible qu'il a mise en pause : la pause est un geste de l'opérateur. */
    public function test_d5_defaire_est_refuse_si_l_operateur_a_mis_en_pause_une_cible_touchee(): void
    {
        $this->defaireApresUnGesteDeLOperateur(RadarTargetStatus::Paused);
    }

    private function defaireApresUnGesteDeLOperateur(RadarTargetStatus $geste): void
    {
        $a = $this->target('A', self::ALMADIES);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('update', ['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']], 'types' => ['apartment'], 'contract' => 'rent'], $a->id, name: 'A2')]);
        $this->pass();
        $revision = RadarTargetRevision::query()->sole();
        $this->assertCount(1, $revision->operations);

        // Le geste de la console : `RadarTargets`, qui n'épingle pas une cible dont seul le statut change.
        app(RadarTargets::class)->update($a->fresh(), ['status' => $geste]);
        $this->assertFalse($a->fresh()->pinned);

        $e = $this->refusal(fn () => app(RadarDemandCurator::class)->revert($revision, $this->operator));

        $this->assertSame([409, 'radar.targets.revision_superseded', ['target_id' => $a->id]], [$e->getStatusCode(), $e->errorCode, $e->params]);
        $this->assertSame($geste, $a->fresh()->status, 'défaire n\'a pas repris la cible');
        $this->assertSame('A2', $a->fresh()->name);
        $this->assertNull($revision->fresh()->reverted_at);
    }

    /** D6 — « défaire » juge le plafond des cibles de la demande, sous le verrou. */
    public function test_d6_defaire_ne_depasse_pas_max_demand(): void
    {
        config(['radar.targets.max_demand' => 2]);
        $a = $this->target('A', self::ALMADIES);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('retire', targetId: $a->id)]);
        $this->pass();
        $r1 = RadarTargetRevision::query()->sole();

        // Deux demandes nouvelles : l'IA crée deux cibles, le plafond est atteint sans toucher A.
        $this->saved(['location' => 'Ngor', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->saved(['location' => 'Almadies', 'type' => ['villa']]);
        $this->model([
            self::op('create', self::NGOR, name: 'Ngor'),
            self::op('create', ['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']], 'types' => ['villa']], name: 'Villas'),
        ]);
        $this->pass();
        $this->assertCount(2, $this->activeDemand());

        $e = $this->refusal(fn () => app(RadarDemandCurator::class)->revert($r1, $this->operator));

        $this->assertSame([422, 'radar.targets.too_many', ['max' => 2]], [$e->getStatusCode(), $e->errorCode, $e->params]);
        $this->assertSame(RadarTargetStatus::Retired, $a->fresh()->status);
        $this->assertCount(2, $this->activeDemand());
        $this->assertNull($r1->fresh()->reverted_at);
    }

    /**
     * D7 — plus aucun signal : les cibles de la demande que l'IA pouvait toucher sont retirées SANS appel, dans une révision
     * qui se défait ; celles de l'opérateur, épinglées ou en pause ne bougent pas. Défaite, elle n'est pas refaite tant que
     * la demande ne revient pas.
     */
    public function test_d7_sans_aucun_signal_les_cibles_de_la_demande_sont_retirees_sans_ia_et_cela_se_defait(): void
    {
        $libre = $this->target('Libre', self::ALMADIES);
        $epinglee = $this->target('Épinglée', self::NGOR, pinned: true);
        $operateur = $this->target('Opérateur', ['cities' => ['Dakar'], 'types' => ['villa']], RadarTargetOrigin::Operator);
        $pause = $this->target('En pause', ['cities' => ['Dakar'], 'types' => ['land']]);
        $pause->forceFill(['status' => RadarTargetStatus::Paused])->save();
        $this->model();

        $this->assertSame(RadarDemandCurator::OUTCOME_NO_SIGNALS_RETIRED, $this->pass());

        RadarDemandTargets::assertNeverPrompted();
        $this->assertSame(RadarTargetStatus::Retired, $libre->fresh()->status);
        $this->assertSame(
            [RadarTargetStatus::Active, RadarTargetStatus::Active, RadarTargetStatus::Paused],
            [$epinglee->fresh()->status, $operateur->fresh()->status, $pause->fresh()->status],
        );
        $revision = RadarTargetRevision::query()->sole();
        $this->assertNull($revision->ai_call_id);
        $this->assertSame(0, $revision->signals_count);
        $this->assertSame([['op' => 'retire', 'target_id' => $libre->id, 'reason' => RadarDemandCurator::REASON_NO_DEMAND]],
            array_map(fn (array $o) => ['op' => $o['op'], 'target_id' => $o['target_id'], 'reason' => $o['reason']], $revision->operations));
        $this->assertSame(RadarDemandCurator::OUTCOME_NO_SIGNALS_RETIRED, RadarDemandSetting::current()->last_run_outcome);

        app(RadarDemandCurator::class)->revert($revision, $this->operator);
        $this->assertSame(RadarTargetStatus::Active, $libre->fresh()->status);

        $this->assertSame(RadarDemandCurator::OUTCOME_NO_SIGNALS, $this->pass(), 'une révision défaite n\'est pas refaite');
        $this->assertSame(RadarTargetStatus::Active, $libre->fresh()->status);
        $this->assertSame(1, RadarTargetRevision::query()->count());
        $this->assertSame(0, AiCall::query()->count());
    }

    /** D8 — une place libérée relance le modèle ; à signaux et places égaux, aucun appel (comme avant). */
    public function test_d8_une_place_liberee_relance_le_modele_a_signaux_egaux(): void
    {
        config(['radar.targets.max_demand' => 1]);
        $ancienne = $this->target('Ancienne', ['cities' => ['Dakar'], 'types' => ['villa']]);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent', 'price_max' => 600000]);
        $this->model(
            [self::op('create', self::ALMADIES, name: 'Almadies')],
            [self::op('create', self::ALMADIES, name: 'Almadies')],
        );
        $this->pass();
        $this->assertSame([RadarDemandCurator::DISCARD_TOO_MANY], array_column(RadarTargetRevision::query()->sole()->discarded, 'code'));
        $this->assertSame(RadarDemandCurator::OUTCOME_UNCHANGED, $this->pass(), 'rien n\'a bougé : aucun appel');
        $this->assertCount(1, $this->prompts);

        app(RadarTargets::class)->retire($ancienne->fresh()); // l'opérateur fait de la place

        $this->assertSame(RadarDemandCurator::OUTCOME_APPLIED, $this->pass());
        $this->assertCount(2, $this->prompts);
        $this->assertSame(['Almadies'], array_map(fn (RadarTarget $t) => $t->name, $this->activeDemand()));
        $this->assertSame(RadarDemandCurator::OUTCOME_UNCHANGED, $this->pass(), 'la place prise, l\'empreinte est stable');
        $this->assertCount(2, $this->prompts);
    }

    /**
     * D8 ne casse pas la promesse de « défaire » : la place qu'un « défaire » libère ne relance pas le modèle tant que la
     * demande ne change pas — que la révision défaite soit la dernière ou une plus ancienne.
     */
    public function test_la_place_liberee_par_un_defaire_ne_relance_pas_le_modele(): void
    {
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('create', self::ALMADIES, name: 'Almadies')], [self::op('create', self::NGOR, name: 'Ngor')]);
        $this->pass();
        $this->saved(['location' => 'Ngor', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->pass();
        [$first, $second] = RadarTargetRevision::query()->orderBy('id')->get()->all();
        $this->assertSame(['Almadies', 'Ngor'], array_map(fn (RadarTarget $t) => $t->name, $this->activeDemand()));

        app(RadarDemandCurator::class)->revert($first, $this->operator);
        $this->assertSame(RadarDemandCurator::OUTCOME_UNCHANGED, $this->pass(), 'une révision plus ancienne défaite');

        app(RadarDemandCurator::class)->revert($second, $this->operator);
        $this->assertSame(RadarDemandCurator::OUTCOME_UNCHANGED, $this->pass(), 'la dernière révision défaite');

        $this->assertCount(2, $this->prompts);
        $this->assertSame([], $this->activeDemand());
    }

    /** Décision 2a (2026-11-04) — l'IA ne touche jamais une cible retirée : ni réglée, ni fusionnée, ni retirée de nouveau. */
    public function test_une_cible_retiree_n_est_jamais_touchee_par_l_ia(): void
    {
        $retiree = $this->target('Retirée', self::ALMADIES);
        $retiree->forceFill(['status' => RadarTargetStatus::Retired])->save();
        $libre = $this->target('Libre', self::NGOR);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([
            self::op('update', self::ALMADIES, $retiree->id, name: 'Reprise'),
            self::op('merge', ['cities' => ['Dakar'], 'types' => ['apartment'], 'contract' => 'rent'], $libre->id, [$libre->id, $retiree->id], 'Fusion'),
            self::op('retire', targetId: $retiree->id),
        ]);

        $this->pass();

        $this->assertSame(['Retirée', RadarTargetStatus::Retired], [$retiree->fresh()->name, $retiree->fresh()->status]);
        $this->assertSame(RadarTargetStatus::Active, $libre->fresh()->status);
        $this->assertSame(array_fill(0, 3, RadarDemandCurator::DISCARD_UNKNOWN_TARGET), array_column(RadarTargetRevision::query()->sole()->discarded, 'code'));
    }

    /** Une opération écartée garde le nom de la cible qu'elle visait, pour la console. */
    public function test_une_operation_ecartee_garde_le_nom_de_la_cible_visee(): void
    {
        $operateur = $this->target('Cible de l\'opérateur', self::ALMADIES, RadarTargetOrigin::Operator);
        $this->saved(['location' => 'Almadies', 'type' => ['apartment'], 'contract_type' => 'rent']);
        $this->model([self::op('retire', targetId: $operateur->id), self::op('update', self::NGOR, 999999, name: 'Absente')]);

        $this->pass();

        $discarded = RadarTargetRevision::query()->sole()->discarded;
        $this->assertSame(['Cible de l\'opérateur', null], array_column($discarded, 'target_name'));
    }

    private function refusal(callable $call): HttpExceptionInterface
    {
        try {
            $call();
        } catch (HttpExceptionInterface $e) {
            return $e;
        }
        $this->fail('attendu : un refus');
    }

    private function assertRefused(callable $call, int $status, string $code): void
    {
        try {
            $call();
            $this->fail("attendu : {$status} {$code}");
        } catch (HttpExceptionInterface $e) {
            $this->assertSame([$status, $code], [$e->getStatusCode(), $e->errorCode ?? $e->getMessage()]);
        }
    }
}
