<?php

namespace Tests\Feature\Ai;

use App\Models\Agency;
use App\Models\AiCall;
use App\Models\AiModel;
use App\Models\AiUsageSetting;
use App\Models\User;
use App\Services\Ai\AiBudget;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\TextUsage;
use Laravel\Ai\Responses\StructuredTextResponse;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2448 (ADR-0086) — le coût et le plafond sont en dollars, exacts, et le taux n'en décide jamais. */
class AiCostsInDollarsTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private const TARIF_INFIME = '0.00000000004';

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->operateur = $this->actingAsRole('super_admin');
    }

    private function modeleInfime(int $tokens): void
    {
        AiModel::factory()->create(['model' => 'modele-infime', 'input' => self::TARIF_INFIME, 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']);
        config(['ai.roles.extraction' => [['provider' => 'anthropic', 'model' => 'modele-infime', 'max_tokens' => 100]]]);
        AgentDEssai::fake(fn (string $p, $a, $provider, string $model) => new StructuredTextResponse(['titre' => 'Villa', 'prix' => 100], '{}', new TextUsage($tokens, 0), new Meta('anthropic', $model)));
    }

    /** Une entrée neuve à chaque appel : l'usage d'essai met ses réponses en cache. */
    private function appeler(): AiCall
    {
        return app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, Str::random(), actor: $this->operateur))->call;
    }

    /** AC8 — 7 × 4e-11 / 1e6 : relu de la base, sans un chiffre de perdu. */
    public function test_a_tiny_call_is_recorded_non_zero_and_exact_to_the_last_digit(): void
    {
        $this->modeleInfime(7);

        $call = $this->appeler()->fresh();

        $this->assertSame('0.00000000000000028', $call->cost_estimate_usd);
    }

    /** AC8 — un tarif plus long que ce qu'un `float` retient : chaque chiffre du coût est encore là. */
    public function test_a_long_price_keeps_every_digit_of_the_cost(): void
    {
        AiModel::factory()->create(['model' => 'modele-long', 'input' => '0.123456789012345678901234567890', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']);
        config(['ai.roles.extraction' => [['provider' => 'anthropic', 'model' => 'modele-long', 'max_tokens' => 100]]]);
        AgentDEssai::fake(fn (string $p, $a, $provider, string $model) => new StructuredTextResponse(['titre' => 'Villa', 'prix' => 100], '{}', new TextUsage(1_000_003, 0), new Meta('anthropic', $model)));

        $this->assertSame('0.12345715938271271593827127159370367', $this->appeler()->fresh()->cost_estimate_usd);
    }

    /** AC8 — dix appels à 2,8e-16 $ atteignent un plafond de 2,8e-15 $ au dixième, ni avant ni après. */
    public function test_a_day_of_tiny_calls_reaches_the_expected_ceiling_exactly(): void
    {
        $this->modeleInfime(7);
        AiUsageSetting::query()->create(['usage_key' => UsageDEssai::KEY, 'daily_budget_usd' => '0.0000000000000028']);

        for ($i = 0; $i < 10; $i++) {
            $this->appeler();
        }
        $this->assertSame('0.0000000000000028', app(AiBudget::class)->spentToday(UsageDEssai::KEY));

        $this->expectException(AiRefused::class);
        $this->appeler();
    }

    /** AC8 — le dernier chiffre décide : au `float`, ces deux montants sont égaux, et l'usage serait bloqué. */
    public function test_a_spend_short_of_the_ceiling_by_its_last_digit_is_not_exhausted(): void
    {
        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => '0.3']);
        $reglage = AiUsageSetting::query()->create(['usage_key' => UsageDEssai::KEY, 'daily_budget_usd' => '0.30000000000000000000001']);

        $this->assertSame(0, (int) round((0.3 <=> (float) $reglage->daily_budget_usd)), 'le témoin : le float ne les distingue pas');
        $this->assertFalse(app(AiBudget::class)->exhausted(new UsageDEssai, $reglage, null));

        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => '0.00000000000000000000001']);
        $this->assertTrue(app(AiBudget::class)->exhausted(new UsageDEssai, $reglage, null));
    }

    /** AC8 — la somme se fait en SQL : l'accumulation de 0,1 ne dérive pas (`0.1 + 0.2` au `float`). */
    public function test_the_sum_of_a_day_does_not_drift(): void
    {
        foreach (['0.1', '0.2'] as $cout) {
            AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => $cout]);
        }

        $this->assertSame('0.3', app(AiBudget::class)->spentToday());
    }

    public function test_the_columns_have_no_declared_precision(): void
    {
        $colonnes = collect(DB::select("select table_name, column_name, data_type, numeric_precision from information_schema.columns
            where (table_name, column_name) in (('ai_calls','cost_estimate_usd'),('ai_usage_settings','daily_budget_usd'),('ai_models','input'),('ai_models','output'),('ai_models','cache_read'),('ai_models','cache_write'))"));

        $this->assertCount(6, $colonnes);
        foreach ($colonnes as $colonne) {
            $this->assertSame(['numeric', null], [$colonne->data_type, $colonne->numeric_precision], $colonne->table_name.'.'.$colonne->column_name);
        }
    }

    /** AC9 — le taux change : ni le coût enregistré, ni le plafond, ni le blocage ne bougent. Seul l'affichage suit. */
    public function test_changing_the_rate_changes_only_what_is_displayed(): void
    {
        $this->modeleInfime(1_000_000);
        AiUsageSetting::query()->create(['usage_key' => UsageDEssai::KEY, 'daily_budget_usd' => '0.00000000008']);
        config(['ai.budgets.daily_global_usd' => '0.00000000012', 'ai.budgets.daily_per_agency_usd' => '0.00000000012']);
        $agence = Agency::factory()->create();
        AiCall::query()->create(['usage_key' => 'autre.usage', 'outcome' => 'success', 'cost_estimate_usd' => '0']);
        $mesure = function () use ($agence): array {
            $reglage = AiUsageSetting::query()->sole();

            return [
                AiCall::query()->where('usage_key', UsageDEssai::KEY)->orderBy('id')->pluck('cost_estimate_usd')->all(),
                $reglage->daily_budget_usd,
                app(AiBudget::class)->exhausted(new UsageDEssai, $reglage, $agence->id),
            ];
        };

        $this->appeler();
        foreach (['600', '0.5', '1000000'] as $taux) {
            config(['ai.usd_to_xof' => $taux]);
            $this->assertSame([['0.00000000004'], '0.00000000008', false], $mesure(), "taux {$taux}");
            $this->assertSame($taux, $this->getJson('/api/admin/ai/usages')->json('meta.usd_to_xof'));
        }

        $this->appeler();
        foreach (['600', '0.5', '1000000'] as $taux) {
            config(['ai.usd_to_xof' => $taux]);
            $this->assertSame([['0.00000000004', '0.00000000004'], '0.00000000008', true], $mesure(), "taux {$taux}");
        }
    }

    /** AC9 — le plafond global et celui de l'agence ne suivent pas le taux non plus. */
    public function test_the_global_and_agency_ceilings_ignore_the_rate(): void
    {
        $agence = Agency::factory()->create();
        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => '1', 'agency_id' => $agence->id]);

        foreach ([['ai.budgets.daily_global_usd', null], ['ai.budgets.daily_per_agency_usd', $agence->id]] as [$plafond, $agency]) {
            config(['ai.budgets.daily_global_usd' => null, 'ai.budgets.daily_per_agency_usd' => null]);
            foreach (['600', '0.5', '1000000'] as $taux) {
                config(['ai.usd_to_xof' => $taux, $plafond => '1.5']);
                $this->assertFalse(app(AiBudget::class)->exhausted(new UsageDEssai, null, $agency), "{$plafond} {$taux}");
                config([$plafond => '1']);
                $this->assertTrue(app(AiBudget::class)->exhausted(new UsageDEssai, null, $agency), "{$plafond} {$taux}");
            }
        }
    }

    /** AC9 — le tableau de bord rend le coût inchangé, et le taux à côté. */
    public function test_the_dashboard_cost_ignores_the_rate(): void
    {
        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => '0.00000000004']);
        $url = '/api/admin/ai/dashboard?'.http_build_query(['from' => now()->toDateString(), 'to' => now()->toDateString()]);

        $this->assertSame('0.00000000004', $this->getJson($url)->json('data.days.0.cost_usd'));
        $this->assertSame('600', $this->getJson($url)->json('data.usd_to_xof'));

        config(['ai.usd_to_xof' => '1']);
        $this->assertSame('0.00000000004', $this->getJson($url)->json('data.days.0.cost_usd'));
        $this->assertSame('0.00000000004', $this->getJson($url)->json('data.today.spent_usd'));
        $this->assertSame('1', $this->getJson($url)->json('data.usd_to_xof'));
    }

    public function test_a_ceiling_is_a_decimal_string_and_keeps_every_digit(): void
    {
        $url = '/api/admin/ai/usages/'.UsageDEssai::KEY;

        $this->patchJson($url, ['daily_budget_usd' => '0.00000000004'])->assertOk();
        $this->assertSame('0.00000000004', AiUsageSetting::query()->sole()->fresh()->daily_budget_usd);

        foreach ([0.5, 250, '1e-3', '-1'] as $plafond) {
            $this->patchJson($url, ['daily_budget_usd' => $plafond])->assertStatus(422)->assertJsonValidationErrors('daily_budget_usd');
        }
        $this->patchJson($url, ['daily_budget_usd' => null])->assertOk();
        $this->assertNull(AiUsageSetting::query()->sole()->daily_budget_usd);
    }
}
