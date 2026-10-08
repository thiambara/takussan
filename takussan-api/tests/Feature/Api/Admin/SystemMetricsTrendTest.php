<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\PlatformMetricDaily;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-360 — le contrat du bloc `trend` de `/api/admin/system/metrics`.
 *
 * Ce qui est éprouvé ici n'est PAS « la variation est juste » : c'est **l'ABSENCE d'une clé quand
 * la période de comparaison n'existe pas**. C'est la moitié du contrat que le front ne peut pas
 * deviner, et celle qu'une régression casserait en silence — un `0` rendu à la place d'une clé
 * absente produit une tendance qui a l'air d'une mesure.
 *
 * TCK-595 (ADR-0057 §4) — le point de comparaison se lit dans l'instantané de J-30, et nulle part
 * ailleurs. Des agences et des encaissements antérieurs à la coupure ne suffisent plus : sans
 * instantané, pas de tendance.
 */
class SystemMetricsTrendTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-15 10:00:00');
    }

    public function test_previous_carries_every_measured_column_of_the_snapshot_thirty_days_ago(): void
    {
        $this->actingAsRole('super_admin');
        PlatformMetricDaily::query()->create([
            'date' => '2026-06-15',
            'gmv_amount' => 10_000,
            'platform_fees_amount' => 500,
            'collected_total_amount' => 100_000,
            'mrr_amount' => 35_000,
            'mrr_trialing_amount' => 0,
            'active_subscriptions' => 2,
            'agencies_total' => 2,
            'agencies_active' => 2,
            'agencies_verified' => 1,
            'agencies_suspended' => 0,
            'users_total' => 3,
            'users_active' => 3,
            'properties_published' => 4,
            'properties_pending_review' => 1,
            'leases_active' => 5,
            'stocks_captured_at' => '2026-06-16 00:30:00',
        ]);

        $previous = $this->getJson('/api/admin/system/metrics')
            ->assertOk()
            ->assertJsonPath('data.trend.period_days', 30)
            ->json('data.trend.previous');

        $this->assertSame(2, $previous['agencies_total']);
        $this->assertSame(3, $previous['users_total']);
        $this->assertSame(0, $previous['agencies_suspended']);
        $this->assertEqualsWithDelta(100_000, $previous['revenue_collected_total'], 0.001);
        $this->assertEqualsWithDelta(35_000, $previous['revenue_mrr'], 0.001);
    }

    public function test_previous_is_empty_without_a_snapshot_even_when_rows_predate_the_cutoff(): void
    {
        $this->actingAsRole('super_admin');
        Agency::factory()->count(2)->create(['created_at' => now()->subDays(60)]);
        User::factory()->count(3)->create(['created_at' => now()->subDays(45)]);

        $this->getJson('/api/admin/system/metrics')
            ->assertOk()
            ->assertJsonPath('data.trend.previous', [])
            ->assertJsonMissingPath('data.trend.previous.agencies_total')
            ->assertJsonMissingPath('data.trend.previous.users_total');
    }

    public function test_a_backfilled_snapshot_gives_its_flows_and_never_its_stocks(): void
    {
        $this->actingAsRole('super_admin');
        PlatformMetricDaily::query()->create([
            'date' => '2026-06-15',
            'gmv_amount' => 0,
            'platform_fees_amount' => 0,
            'collected_total_amount' => 80_000,
        ]);

        $previous = $this->getJson('/api/admin/system/metrics')->assertOk()->json('data.trend.previous');

        $this->assertSame(['revenue_collected_total'], array_keys($previous));
    }
}
