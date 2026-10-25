<?php

namespace Tests\Feature\Billing;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Plan;
use App\Services\Billing\AgencySubscriptionService;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1501 (P129.05, ADR-0048 amendé le 2026-10-22, décision du porteur, V1) — l'essai d'une
 * agence `inactive` ou `suspended` ne se convertit pas : une agence sortie d'activité ne commence
 * pas à être facturée. Le job la saute, et l'essai échu se convertit au premier passage qui suit
 * son retour à `active`.
 */
class FinDEssaiParStatutDAgenceTest extends TestCase
{
    use RefreshDatabase;

    private function essaiEchu(AgencyStatus $statut): AgencySubscription
    {
        $agency = Agency::factory()->create(['status' => $statut]);
        $plan = Plan::query()->create([
            'code' => 'trial-'.$statut->value,
            'label' => 'Essai',
            'monthly_price_xof' => 0,
            'platform_fee_pct' => 0,
            'trial_days' => 14,
            'limits' => [],
            'is_active' => true,
            'sort_order' => 10,
        ]);

        return AgencySubscription::query()->create([
            'agency_id' => $agency->id,
            'plan_id' => $plan->id,
            'status' => AgencySubscriptionStatus::Trialing,
            'trial_ends_at' => now()->subMinute(),
            'current_period_start' => now()->subDays(14),
            'current_period_end' => now()->addDays(16),
        ]);
    }

    /** @return array<string, array{AgencyStatus, AgencySubscriptionStatus, int}> */
    public static function statuts(): array
    {
        return [
            'active : converti' => [AgencyStatus::Active, AgencySubscriptionStatus::Active, 1],
            'inactive : sauté' => [AgencyStatus::Inactive, AgencySubscriptionStatus::Trialing, 0],
            'suspended : sauté' => [AgencyStatus::Suspended, AgencySubscriptionStatus::Trialing, 0],
        ];
    }

    #[DataProvider('statuts')]
    public function test_la_fin_d_essai_suit_le_statut_de_l_agence(AgencyStatus $statut, AgencySubscriptionStatus $attendu, int $convertis): void
    {
        $subscription = $this->essaiEchu($statut);

        $this->assertSame($convertis, app(AgencySubscriptionService::class)->processTrialExpirations());
        $this->assertSame($attendu, $subscription->refresh()->status);
    }

    public function test_l_essai_saute_se_convertit_au_premier_passage_apres_le_retour_a_active(): void
    {
        $subscription = $this->essaiEchu(AgencyStatus::Suspended);
        $service = app(AgencySubscriptionService::class);

        $this->assertSame(0, $service->processTrialExpirations());
        $subscription->agency->forceFill(['status' => AgencyStatus::Active])->save();

        $this->assertSame(1, $service->processTrialExpirations());
        $this->assertSame(AgencySubscriptionStatus::Active, $subscription->refresh()->status);
    }

    /** @return array<string, array{\Closure(AgencySubscription): void}> */
    public static function changementsApresLaSelection(): array
    {
        return [
            'agence suspendue' => [fn (AgencySubscription $s) => Agency::query()->whereKey($s->agency_id)
                ->update(['status' => AgencyStatus::Suspended->value])],
            'essai prolongé' => [fn (AgencySubscription $s) => AgencySubscription::query()->whereKey($s->id)
                ->update(['trial_ends_at' => now()->addDays(7)])],
            'fin posée' => [fn (AgencySubscription $s) => AgencySubscription::query()->whereKey($s->id)
                ->update(['ended_at' => now()])],
        ];
    }

    /**
     * TCK-2310 (P229.06) — sur le patron de `renewPeriods` : chaque essai se relit sous verrou et
     * tous les critères de la sélection s'y rejugent, statut de l'agence compris. Le changement est
     * écrit juste après la requête qui fige les identifiants, comme l'écrirait un geste concurrent.
     */
    #[DataProvider('changementsApresLaSelection')]
    public function test_un_critere_change_apres_la_selection_ne_convertit_pas_l_essai(\Closure $changement): void
    {
        $subscription = $this->essaiEchu(AgencyStatus::Active);

        $joue = false;
        DB::listen(function (QueryExecuted $query) use (&$joue, $changement, $subscription): void {
            if (! $joue && str_starts_with($query->sql, 'select "id" from "agency_subscriptions"')) {
                $joue = true;
                $changement($subscription);
            }
        });

        $this->assertSame(0, app(AgencySubscriptionService::class)->processTrialExpirations());
        $this->assertTrue($joue, 'la requête de sélection n\'a pas été vue');
        $this->assertSame(AgencySubscriptionStatus::Trialing, $subscription->refresh()->status);
    }
}
