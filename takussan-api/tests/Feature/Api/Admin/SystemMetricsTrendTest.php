<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-360 — le contrat du bloc `trend` de `/api/admin/system/metrics`.
 *
 * Ce qui est éprouvé ici n'est PAS « la variation est juste » : c'est **l'ABSENCE d'une clé quand
 * la période de comparaison n'existe pas**. C'est la moitié du contrat que le front ne peut pas
 * deviner, et celle qu'une régression casserait en silence — un `0` rendu à la place d'une clé
 * absente produit une tendance qui a l'air d'une mesure.
 */
class SystemMetricsTrendTest extends TestCase
{
    use RefreshDatabase;

    public function test_previous_carries_the_metrics_that_predate_the_cutoff(): void
    {
        $this->actingAsRole('super_admin');

        Agency::factory()->count(2)->create(['created_at' => now()->subDays(60)]);
        Agency::factory()->create(['created_at' => now()->subDay()]);
        User::factory()->count(3)->create(['created_at' => now()->subDays(45)]);

        $response = $this->getJson('/api/admin/system/metrics')
            ->assertOk()
            ->assertJsonPath('data.trend.period_days', 30)
            ->assertJsonPath('data.trend.previous.agencies_total', 2);

        // L'utilisateur qui appelle la route est créé maintenant : il compte dans le total courant,
        // jamais dans le point de comparaison.
        $this->assertSame(3, $response->json('data.trend.previous.users_total'));
    }

    public function test_previous_is_empty_when_nothing_predates_the_cutoff(): void
    {
        $this->actingAsRole('super_admin');

        Agency::factory()->count(2)->create(['created_at' => now()->subDays(3)]);

        $this->getJson('/api/admin/system/metrics')
            ->assertOk()
            ->assertJsonPath('data.trend.previous', [])
            ->assertJsonMissingPath('data.trend.previous.agencies_total')
            ->assertJsonMissingPath('data.trend.previous.users_total');
    }

    public function test_revenue_has_a_comparison_point_when_every_paid_payment_is_dated(): void
    {
        $this->actingAsRole('super_admin');

        LeasePayment::factory()->paid()->create(['paid_at' => now()->subDays(60), 'amount' => 100_000]);
        LeasePayment::factory()->paid()->create(['paid_at' => now()->subDay(), 'amount' => 50_000]);

        // JSON ne distingue pas 100000 de 100000.0 : la comparaison est NUMÉRIQUE, pas identique.
        $this->assertEqualsWithDelta(
            100_000,
            $this->getJson('/api/admin/system/metrics')
                ->assertOk()
                ->json('data.trend.previous.revenue_platform_total_paid'),
            0.001,
        );
    }

    public function test_revenue_has_no_comparison_point_when_a_paid_payment_carries_no_date(): void
    {
        $this->actingAsRole('super_admin');

        LeasePayment::factory()->paid()->create(['paid_at' => now()->subDays(60), 'amount' => 100_000]);
        LeasePayment::factory()->paid()->create(['paid_at' => null, 'amount' => 50_000]);

        $this->getJson('/api/admin/system/metrics')
            ->assertOk()
            ->assertJsonMissingPath('data.trend.previous.revenue_platform_total_paid');
    }
}
