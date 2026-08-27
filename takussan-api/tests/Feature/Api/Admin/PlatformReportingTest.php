<?php

namespace Tests\Feature\Api\Admin;

use App\Jobs\Reporting\GenerateReportExport;
use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Plan;
use App\Models\ReportExport;
use App\Services\Reporting\PlatformReportingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class PlatformReportingTest extends TestCase
{
    use RefreshDatabase;

    public function test_growth_endpoint_returns_envelope_with_buckets(): void
    {
        // Set the test clock BEFORE actingAs so the auto-created super-admin
        // agency stamps `created_at = 2026-05-15` and falls inside our window.
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        $baselineApril = Agency::query()->whereBetween('created_at', ['2026-04-01', '2026-04-30 23:59:59'])->count();
        $baselineMay = Agency::query()->whereBetween('created_at', ['2026-05-01', '2026-05-31 23:59:59'])->count();

        Agency::factory()->create(['created_at' => '2026-04-10']);
        Agency::factory()->create(['created_at' => '2026-04-20']);
        Agency::factory()->create(['created_at' => '2026-05-05']);

        $response = $this->getJson('/api/admin/reports/growth?metric=agencies&period=3m&granularity=month')
            ->assertOk();

        $response->assertJsonPath('data.period.granularity', 'month');
        $rows = $response->json('data.rows');
        $this->assertNotNull($rows);

        $apr = collect($rows)->first(fn ($r) => str_starts_with($r['bucket'], '2026-04'));
        $may = collect($rows)->first(fn ($r) => str_starts_with($r['bucket'], '2026-05'));
        $this->assertSame($baselineApril + 2, $apr['count']);
        $this->assertSame($baselineMay + 1, $may['count']);

        Carbon::setTestNow();
    }

    /**
     * TCK-361 — la PLAGE LIBRE. Avant, `period` était une énumération fermée ancrée sur `now()` :
     * aucune fenêtre autre que « les N derniers mois » n'était demandable.
     */
    public function test_growth_accepts_a_free_date_range(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        $baselineFebruary = Agency::query()
            ->whereBetween('created_at', ['2026-02-01', '2026-02-28 23:59:59'])->count();

        Agency::factory()->create(['created_at' => '2026-02-10']);
        Agency::factory()->create(['created_at' => '2026-02-11']);
        // Hors fenêtre : présent en base, il doit rester absent de la série.
        Agency::factory()->create(['created_at' => '2026-05-05']);

        $response = $this
            ->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2026-01-01&ends_at=2026-03-31')
            ->assertOk();

        $response->assertJsonPath('data.period.range', '2026-01-01..2026-03-31');

        $buckets = collect($response->json('data.rows'))->pluck('bucket')->all();
        $this->assertSame(['2026-01', '2026-02', '2026-03'], $buckets);

        $feb = collect($response->json('data.rows'))->firstWhere('bucket', '2026-02');
        $this->assertSame($baselineFebruary + 2, $feb['count']);

        Carbon::setTestNow();
    }

    /**
     * La COMPARAISON du front est un second appel sur la fenêtre décalée. Ce test éprouve ce qui
     * la rendait impossible : deux fenêtres distinctes doivent rendre deux séries distinctes.
     *
     * ⚠ C'est aussi la garde du cache : la plage entre dans la clé (`windowKey`). Sans elle, le
     * second appel resservirait la série du premier pendant 10 minutes, et la comparaison se
     * confondrait avec la série principale sans qu'aucune erreur ne soit levée.
     */
    public function test_two_distinct_windows_do_not_share_a_cache_entry(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        Agency::factory()->create(['created_at' => '2026-02-10']);

        $courante = $this->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2026-04-01&ends_at=2026-04-30')
            ->assertOk();
        $precedente = $this->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2026-02-01&ends_at=2026-02-28')
            ->assertOk();

        $this->assertSame(['2026-04'], collect($courante->json('data.rows'))->pluck('bucket')->all());
        $this->assertSame(['2026-02'], collect($precedente->json('data.rows'))->pluck('bucket')->all());
        $this->assertGreaterThan(
            $courante->json('data.totals.total'),
            $precedente->json('data.totals.total'),
        );

        Carbon::setTestNow();
    }

    /**
     * TCK-361 / D5 — **la borne BASSE d'une plage libre borne réellement le premier bucket.**
     *
     * `bucketsFor` ramenait la borne HAUTE du dernier bucket à `end` et laissait la borne basse du
     * premier à `startOfMonth($cursor)`. Une fenêtre qui ne commence pas un 1er du mois comptait
     * donc tout le début du mois — quatorze jours ici — sous une étiquette que l'utilisateur a
     * lui-même choisie. Le chiffre était faux, sans erreur, dans la fonctionnalité que ce ticket
     * introduit.
     *
     * L'asymétrie ne se voyait pas à l'œil parce que les deux bornes ne sont pas écrites au même
     * endroit : l'une est un `match`, l'autre un `if` trois lignes plus bas.
     */
    public function test_a_free_range_starting_mid_month_ignores_what_precedes_its_lower_bound(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        $baseline = Agency::query()
            ->whereBetween('created_at', ['2026-03-15', '2026-03-31 23:59:59'])->count();
        $baselineFevrier = Agency::query()
            ->whereBetween('created_at', ['2026-02-01', '2026-02-28 23:59:59'])->count();

        Agency::factory()->create(['created_at' => '2026-03-02']); // AVANT la borne demandée.
        Agency::factory()->create(['created_at' => '2026-03-20']); // dans la fenêtre.

        $response = $this
            ->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2026-03-15&ends_at=2026-03-31')
            ->assertOk();

        $rows = $response->json('data.rows');
        $this->assertSame(['2026-03'], collect($rows)->pluck('bucket')->all());
        $this->assertStringStartsWith('2026-03-15', $rows[0]['starts_at'], 'Le premier bucket doit COMMENCER à la borne demandée.');
        $this->assertSame($baseline + 1, $rows[0]['count']);
        $this->assertSame($baseline + 1, $response->json('data.totals.total'));

        // AC4 — la comparaison est un second appel sur la fenêtre décalée, elle calée sur des 1ers
        // du mois. Tant que le premier bucket de la série principale débordait, on comparait un
        // bucket gonflé à un bucket propre : l'écart affiché était un artefact de bornage.
        $precedente = $this
            ->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2026-02-01&ends_at=2026-02-28')
            ->assertOk();

        $this->assertSame(['2026-02'], collect($precedente->json('data.rows'))->pluck('bucket')->all());
        $this->assertSame(
            $baselineFevrier,
            $precedente->json('data.totals.total'),
            "L'agence du 2 mars n'appartient à AUCUNE des deux fenêtres : ni à mars-15..31, ni à février.",
        );

        Carbon::setTestNow();
    }

    /**
     * TCK-361 / D1 — le JUMEAU de `test_two_distinct_windows_do_not_share_a_cache_entry`, côté
     * REVENUS. Le même défaut (`windowKey` absent de la clé) était attrapé sur `growth` et sur rien
     * d'autre : remplacer `$this->windowKey($window)` par une constante à la ligne de `revenue()`
     * laissait la suite entièrement verte. Or AC4 exige la comparaison sur croissance ET revenus —
     * et c'est précisément là que le défaut se voit le moins : la série de comparaison devient
     * byte-identique à la principale, sans qu'aucune erreur ne soit levée.
     */
    public function test_two_distinct_revenue_windows_do_not_share_a_cache_entry(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        $courante = $this->getJson('/api/admin/reports/revenue?granularity=month&starts_at=2026-04-01&ends_at=2026-04-30')
            ->assertOk();
        $precedente = $this->getJson('/api/admin/reports/revenue?granularity=month&starts_at=2026-02-01&ends_at=2026-02-28')
            ->assertOk();

        $this->assertSame(['2026-04'], collect($courante->json('data.rows'))->pluck('bucket')->all());
        $this->assertSame(['2026-02'], collect($precedente->json('data.rows'))->pluck('bucket')->all());
        $this->assertSame('2026-04-01..2026-04-30', $courante->json('data.period.range'));
        $this->assertSame('2026-02-01..2026-02-28', $precedente->json('data.period.range'));

        Carbon::setTestNow();
    }

    public function test_revenue_accepts_a_free_date_range(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        $response = $this
            ->getJson('/api/admin/reports/revenue?granularity=month&starts_at=2026-01-01&ends_at=2026-02-28')
            ->assertOk();

        $response->assertJsonPath('data.period.range', '2026-01-01..2026-02-28');
        $this->assertSame(['2026-01', '2026-02'], collect($response->json('data.rows'))->pluck('bucket')->all());

        Carbon::setTestNow();
    }

    /** Une borne seule ne décrit aucune fenêtre : elle doit être refusée, pas ignorée. */
    public function test_a_lone_range_bound_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/reports/growth?metric=agencies&starts_at=2026-01-01')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['ends_at']);
    }

    /** L'export suit l'écran : la plage libre doit voyager jusqu'au fichier. */
    public function test_export_carries_the_free_date_range(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        $this->get('/api/admin/reports/growth/export?format=csv&metric=agencies&granularity=month&starts_at=2026-01-01&ends_at=2026-03-31')
            ->assertOk();

        $export = ReportExport::query()->latest('id')->firstOrFail();
        $this->assertSame('2026-01-01', $export->parameters['starts_at']);
        $this->assertSame('2026-03-31', $export->parameters['ends_at']);
        $this->assertSame(3, $export->row_count);

        Carbon::setTestNow();
    }

    /**
     * TCK-389 — AC1 / AC2 : une plage plus large que le plafond est REFUSÉE, et ne rend plus une
     * série de deux mois sous une enveloppe qui annonce six ans.
     *
     * La sonde du ticket, mesurée le 2026-08-27 avant correctif :
     *     buckets=60  premier=2020-01-01  dernier=2020-02-29  range=2020-01-01..2026-01-01
     */
    public function test_a_range_wider_than_the_bucket_cap_is_refused(): void
    {
        $this->actingAsRole('super_admin');

        $reponse = $this->getJson('/api/admin/reports/growth?metric=agencies&granularity=day&starts_at=2020-01-01&ends_at=2026-01-01')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['ends_at']);

        // Ce que le défaut rendait : une enveloppe. Il ne doit plus rien rendre du tout.
        $this->assertNull($reponse->json('data'));
        $this->assertStringContainsString('60', (string) $reponse->json('errors.ends_at.0'));
    }

    /** La borne est le plafond LUI-MÊME : 60 intervalles passent, 61 ne passent pas. */
    public function test_the_cap_is_exactly_sixty_buckets(): void
    {
        $this->actingAsRole('super_admin');

        // 2021-01 → 2025-12 : soixante mois pile.
        $this->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2021-01-01&ends_at=2025-12-31')
            ->assertOk()
            ->assertJsonCount(60, 'data.rows');

        // Un jour de plus fait basculer dans un soixante-et-unième bucket.
        $this->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2021-01-01&ends_at=2026-01-01')
            ->assertStatus(422);
    }

    /** Le raccourci `period` emprunte le même découpage : `12m` en granularité `day` le dépasse. */
    public function test_the_period_shortcut_is_bound_by_the_same_cap(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/reports/growth?metric=agencies&period=12m&granularity=day')
            ->assertStatus(422)
            // Sur un raccourci, l'appelant n'a de prise que sur la granularité.
            ->assertJsonValidationErrors(['granularity']);

        $this->getJson('/api/admin/reports/growth?metric=agencies&period=12m&granularity=month')
            ->assertOk();
    }

    /** Revenu emprunte le même découpage que Croissance. */
    public function test_revenue_is_bound_by_the_same_cap(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/reports/revenue?granularity=day&starts_at=2020-01-01&ends_at=2026-01-01')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['ends_at']);
    }

    /**
     * TCK-389 — AC3 : l'export emprunte le même service, donc le même refus.
     *
     * Un fichier est précisément ce qu'on relit hors contexte : un CSV tronqué au soixantième
     * intervalle n'a rien qui dise, à la relecture, qu'il ne couvre pas la plage de son nom.
     */
    public function test_an_export_wider_than_the_cap_is_refused_and_writes_nothing(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/reports/growth/export?format=csv&metric=agencies&granularity=day&starts_at=2020-01-01&ends_at=2026-01-01')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['ends_at']);

        // Le refus arrive AVANT la ligne d'export et avant la trace d'audit : ni l'une ni l'autre
        // ne doit rester derrière une demande qui n'a rien produit.
        $this->assertSame(0, ReportExport::query()->count());
        $this->assertFalse(Activity::query()->where('event', 'super_admin_report_exported')->exists());
    }

    /**
     * TCK-388 — AC1 : la plage demandée et sa fenêtre décalée n'opposent pas des durées égales, et
     * l'API le DIT au lieu de le laisser deviner.
     *
     * Les deux appels sont ceux que l'écran émet réellement : la série principale, puis la fenêtre
     * précédente que `fenetrePrecedente()` déduit de ses bornes. Le décalage est d'un nombre entier
     * de buckets MENSUELS — c'est un invariant, l'alignement des deux séries étant positionnel —,
     * d'où 17 jours en face de 28.
     */
    public function test_a_partial_bucket_says_how_many_days_it_covers(): void
    {
        $this->actingAsRole('super_admin');

        $principale = $this->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2026-03-15&ends_at=2026-03-31')
            ->assertOk();
        $principale->assertJsonPath('data.rows.0.bucket', '2026-03');
        $principale->assertJsonPath('data.rows.0.days', 17);
        $principale->assertJsonPath('data.rows.0.partial', true);

        // La fenêtre décalée d'un bucket mensuel : un mois PLEIN, en face du bucket partiel.
        $comparee = $this->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2026-02-01&ends_at=2026-02-28')
            ->assertOk();
        $comparee->assertJsonPath('data.rows.0.bucket', '2026-02');
        $comparee->assertJsonPath('data.rows.0.days', 28);
        $comparee->assertJsonPath('data.rows.0.partial', false);

        $this->assertNotSame(
            $principale->json('data.rows.0.days'),
            $comparee->json('data.rows.0.days'),
            'Les deux fenêtres comparées ne couvrent pas la même durée — c\'est précisément ce que le ticket demande de rendre visible.',
        );
    }

    /**
     * TCK-388 — AC3 : le raccourci `period` est couvert par le MÊME choix que la plage libre.
     *
     * `periodStart('3m')` tombe en milieu de mois. Mesuré le 2026-08-27, horloge figée au 15 mai :
     * le premier bucket vaut 14 jours ET le dernier 15 — le ticket ne nommait que le premier.
     */
    public function test_the_period_shortcut_marks_its_partial_buckets_too(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        $rows = $this->getJson('/api/admin/reports/growth?metric=agencies&period=3m&granularity=month')
            ->assertOk()
            ->json('data.rows');

        $this->assertSame(['2026-02', '2026-03', '2026-04', '2026-05'], array_column($rows, 'bucket'));
        $this->assertSame([14, 31, 30, 15], array_column($rows, 'days'));
        $this->assertSame([true, false, false, true], array_column($rows, 'partial'));

        Carbon::setTestNow();
    }

    /** Revenu porte la même mesure — les deux écrans partagent le graphique et son alignement. */
    public function test_revenue_rows_also_carry_their_bucket_duration(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/reports/revenue?granularity=month&starts_at=2026-03-15&ends_at=2026-03-31')
            ->assertOk()
            ->assertJsonPath('data.rows.0.days', 17)
            ->assertJsonPath('data.rows.0.partial', true);
    }

    /** Une plage alignée sur les frontières de mois ne signale aucune partialité. */
    public function test_whole_month_buckets_are_not_marked_partial(): void
    {
        $this->actingAsRole('super_admin');

        $rows = $this->getJson('/api/admin/reports/growth?metric=agencies&granularity=month&starts_at=2026-01-01&ends_at=2026-03-31')
            ->assertOk()
            ->json('data.rows');

        $this->assertSame([31, 28, 31], array_column($rows, 'days'));
        $this->assertSame([false, false, false], array_column($rows, 'partial'));
    }

    /**
     * TCK-388 — l'export ASYNCHRONE écrit le même CSV que le synchrone, booléens compris.
     *
     * Les deux chemins ont deux écrivains distincts : `ReportingController::downloadPayload()` et
     * `GenerateReportExport::toCsv()`. Le second n'est atteint qu'au-delà de 10 000 lignes, donc
     * jamais sur growth/revenue tant que le découpage est plafonné à 60 buckets — c'est
     * précisément pourquoi il a besoin d'un test : *un chemin qu'aucun appel ne prend est un
     * chemin dont personne ne verra la dérive.* Le jour où le seuil bouge, c'est ici que ça
     * rougira, et pas en production.
     */
    public function test_the_async_export_writes_the_same_csv_as_the_synchronous_one(): void
    {
        Storage::fake('local');
        Carbon::setTestNow('2026-05-15');
        $acteur = $this->actingAsRole('super_admin');

        $export = ReportExport::query()->create([
            'requested_by' => $acteur->id,
            'report' => 'growth',
            'format' => 'csv',
            'parameters' => ['metric' => 'agencies', 'period' => '3m', 'granularity' => 'month'],
            'status' => 'queued',
            'row_count' => 0,
        ]);

        (new GenerateReportExport($export->id))->handle(app(PlatformReportingService::class));

        $csv = Storage::disk('local')->get($export->fresh()->archive_path);
        $entete = str_replace('"', '', strtok($csv, "\n"));

        $this->assertSame('bucket,starts_at,ends_at,days,partial,count', $entete);
        // Les DEUX valeurs en toutes lettres : `period=3m` rend un premier bucket partiel (14 j)
        // et des mois pleins ensuite, donc le fichier porte `true` ET `false`.
        $this->assertStringContainsString('true', str_replace('"', '', $csv));
        $this->assertStringContainsString('false', str_replace('"', '', $csv));

        Carbon::setTestNow();
    }

    /**
     * TCK-388 — une enveloppe mise en cache par le code PRÉCÉDENT ne doit pas être servie.
     *
     * Le changement de forme des lignes (`days` / `partial`) est invisible du cache : la clé
     * d'avant reste valide, et pendant tout le TTL (600 s, redis en production) l'écran rendrait
     * EXACTEMENT le comportement que ce ticket corrige, sans qu'aucune trace ne le dise. Le défaut
     * se répare tout seul au bout de dix minutes — la meilleure façon de ne jamais le comprendre
     * s'il se reproduit ailleurs.
     *
     * ⚠ Ce test REPRODUIT À LA MAIN la clé d'avant TCK-388, et c'est délibérément fragile : il ne
     * peut pas la demander au service, dont c'est justement le secret. Il rougira si le format de
     * clé change pour une autre raison — c'est le prix d'une garde sur un cache, et il est plus bas
     * que celui d'une invalidation qui dépend d'un geste humain au moment du déploiement.
     */
    public function test_an_envelope_cached_by_the_previous_row_shape_is_not_served(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        // La version ÉVÉNEMENTIELLE se lit après `actingAsRole`, qui crée une agence et l'incrémente.
        $version = (int) Cache::get('reporting:cache_version', 0);

        Cache::put("reporting:growth:agencies:3m:month:3m:v{$version}", [
            'rows' => [[
                'bucket' => '1999-01',
                'starts_at' => '1999-01-01T00:00:00+00:00',
                'ends_at' => '1999-01-31T23:59:59+00:00',
                'count' => 999,
            ]],
            'totals' => ['total' => 999],
            'period' => ['range' => '3m', 'granularity' => 'month'],
            'generated_at' => '1999-01-01T00:00:00+00:00',
        ], 600);

        $rows = $this->getJson('/api/admin/reports/growth?metric=agencies&period=3m&granularity=month')
            ->assertOk()
            ->json('data.rows');

        $this->assertNotSame('1999-01', $rows[0]['bucket'], "L'enveloppe de l'ancienne forme a été servie.");
        $this->assertArrayHasKey('days', $rows[0]);
        $this->assertArrayHasKey('partial', $rows[0]);

        Carbon::setTestNow();
    }

    public function test_revenue_mrr_matches_active_subscription_sum(): void
    {
        $this->actingAsRole('super_admin');

        Carbon::setTestNow('2026-05-15');

        $plan10 = Plan::query()->create([
            'code' => 'p10', 'label' => 'P10', 'monthly_price_xof' => 10_000,
            'platform_fee_pct' => 0, 'trial_days' => 0, 'limits' => [], 'is_active' => true, 'sort_order' => 0,
        ]);
        $plan25 = Plan::query()->create([
            'code' => 'p25', 'label' => 'P25', 'monthly_price_xof' => 25_000,
            'platform_fee_pct' => 0, 'trial_days' => 0, 'limits' => [], 'is_active' => true, 'sort_order' => 0,
        ]);

        $a1 = Agency::factory()->create(['created_at' => '2026-01-01']);
        $a2 = Agency::factory()->create(['created_at' => '2026-02-01']);
        $a3 = Agency::factory()->create(['created_at' => '2026-03-01']);

        AgencySubscription::query()->create([
            'agency_id' => $a1->id, 'plan_id' => $plan10->id,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => '2026-01-01', 'current_period_end' => '2027-01-01',
        ]);
        AgencySubscription::query()->create([
            'agency_id' => $a2->id, 'plan_id' => $plan25->id,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => '2026-02-01', 'current_period_end' => '2027-02-01',
        ]);
        // Ended subscription — must NOT contribute to MRR at month X if ended before X.
        AgencySubscription::query()->create([
            'agency_id' => $a3->id, 'plan_id' => $plan25->id,
            'status' => AgencySubscriptionStatus::Ended,
            'current_period_start' => '2026-03-01', 'current_period_end' => '2026-04-01',
            'ended_at' => '2026-04-15',
        ]);

        $response = $this->getJson('/api/admin/reports/revenue?period=3m&granularity=month')->assertOk();

        // Latest bucket (May): only a1+a2 active = 35_000.
        $this->assertEqualsWithDelta(35_000, $response->json('data.totals.latest_mrr'), 0.01);
        $this->assertEqualsWithDelta(35_000 * 12, $response->json('data.totals.latest_arr'), 0.01);
        $this->assertSame(2, $response->json('data.totals.latest_active_subscriptions'));

        Carbon::setTestNow();
    }

    public function test_cohorts_m0_is_100_percent_then_decays(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        // April cohort: 4 agencies, 1 churned mid-April (deleted_at < M0 end).
        Agency::factory()->count(3)->create(['created_at' => '2026-04-05']);
        Agency::factory()->create([
            'created_at' => '2026-04-10',
            'deleted_at' => '2026-04-20',
        ]);

        $response = $this->getJson('/api/admin/reports/cohorts?depth=3')->assertOk();

        $rows = $response->json('data.rows');
        $aprilCohort = collect($rows)->first(fn ($r) => $r['cohort'] === '2026-04');
        $this->assertNotNull($aprilCohort);
        $this->assertSame(4, $aprilCohort['cohort_size']);

        $m0 = collect($aprilCohort['cells'])->first(fn ($c) => $c['month'] === 0);
        // 1 churned before month-end → 3/4 still active at the M0 boundary.
        $this->assertEqualsWithDelta(0.75, $m0['rate'], 0.01);

        Carbon::setTestNow();
    }

    public function test_funnel_returns_4_stages(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/admin/reports/funnel?period=30d')->assertOk();

        $stages = collect($response->json('data.rows'))->pluck('stage')->all();
        $this->assertSame([
            'listings_published',
            'bookings_requested',
            'bookings_confirmed',
            'leases_signed',
        ], $stages);
    }

    public function test_cache_is_invalidated_when_a_new_agency_is_created(): void
    {
        $this->actingAsRole('super_admin');
        Cache::flush();

        // Warm the cache — no agencies yet.
        $first = $this->getJson('/api/admin/reports/growth?metric=agencies&period=3m&granularity=month')->assertOk();
        $firstTotal = $first->json('data.totals.total');

        Agency::factory()->create();

        $second = $this->getJson('/api/admin/reports/growth?metric=agencies&period=3m&granularity=month')->assertOk();
        $secondTotal = $second->json('data.totals.total');

        $this->assertSame($firstTotal + 1, $secondTotal, 'Reporting cache must reflect the new agency without stale fallback.');
    }

    public function test_growth_csv_export_returns_download_and_audits(): void
    {
        Carbon::setTestNow('2026-05-15');
        $actor = $this->actingAsRole('super_admin');

        Agency::factory()->create(['created_at' => '2026-04-10']);

        $response = $this->get('/api/admin/reports/growth/export?format=csv&metric=agencies&period=3m&granularity=month')
            ->assertOk();

        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment;', (string) $response->headers->get('Content-Disposition'));
        $this->assertStringContainsString('takussan-growth-', (string) $response->headers->get('Content-Disposition'));

        $csv = $response->streamedContent();
        // TCK-388 — `days` / `partial` accompagnent chaque ligne jusque dans le fichier : c'est là
        // qu'on relit un rapport hors contexte, et une étiquette `2026-04` n'y dit pas si elle
        // couvre le mois entier.
        $this->assertStringContainsString('bucket,starts_at,ends_at,days,partial,count', str_replace('"', '', $csv));
        $this->assertStringContainsString('2026-04', $csv);
        // Un `false` ne s'écrit pas par une case vide, qui se relirait comme une donnée manquante.
        $this->assertStringContainsString('false', str_replace('"', '', $csv));

        $this->assertTrue(Activity::query()
            ->where('event', 'super_admin_report_exported')
            ->where('causer_id', $actor->id)
            ->where('properties->report', 'growth')
            ->exists());

        $this->assertSame(1, ReportExport::query()->count());
        $this->assertSame('ready', ReportExport::query()->first()?->status);

        Carbon::setTestNow();
    }

    public function test_second_report_csv_export_is_also_a_file(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->get('/api/admin/reports/funnel/export?format=csv&period=30d')->assertOk();

        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment;', (string) $response->headers->get('Content-Disposition'));
        $this->assertStringContainsString('stage,count', str_replace('"', '', $response->streamedContent()));
    }

    public function test_xlsx_export_returns_download_response(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->get('/api/admin/reports/funnel/export?format=xlsx&period=30d')->assertOk();

        $this->assertStringContainsString('spreadsheetml.sheet', (string) $response->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment;', (string) $response->headers->get('Content-Disposition'));
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->getJson('/api/admin/reports/growth?metric=agencies')->assertForbidden();
        $this->getJson('/api/admin/reports/revenue')->assertForbidden();
        $this->getJson('/api/admin/reports/cohorts')->assertForbidden();
        $this->getJson('/api/admin/reports/funnel')->assertForbidden();
        $this->getJson('/api/admin/reports/funnel/export?format=csv')->assertForbidden();
    }

    public function test_anonymous_export_is_unauthenticated(): void
    {
        $this->getJson('/api/admin/reports/growth/export?format=csv&metric=agencies&period=12m')
            ->assertUnauthorized();
    }

    public function test_export_with_unknown_report_returns_404(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/reports/unknown/export?format=csv')->assertStatus(404);
    }
}
