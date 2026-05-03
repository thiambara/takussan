<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\BaseTestCase;

/**
 * TCK-144 — KPIs payload shape. The numbers themselves are validated by
 * the per-resource tests; here we assert the contract is honored.
 */
class SystemMetricsTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_returns_aggregated_kpis_in_a_single_call(): void
    {
        $this->actingAsRole('super_admin');

        Agency::factory()->count(2)->create([
            'is_verified' => true,
            'status' => AgencyStatus::Active,
        ]);
        Agency::factory()->create([
            'is_verified' => false,
            'status' => AgencyStatus::Suspended,
        ]);

        Property::factory()->count(3)->create(['status' => PropertyStatus::Published]);
        Property::factory()->count(2)->create(['status' => PropertyStatus::PendingReview]);

        $this->getJson('/api/admin/system/metrics')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'agencies' => ['total', 'verified', 'active', 'suspended', 'verification_rate'],
                    'users' => ['total', 'active'],
                    'properties' => ['published', 'pending_review'],
                    'leases' => ['active'],
                    'revenue' => ['platform_total_paid', 'currency'],
                    'generated_at',
                ],
            ])
            ->assertJsonPath('data.agencies.total', fn ($v) => $v >= 3)
            ->assertJsonPath('data.agencies.verified', fn ($v) => $v >= 2)
            ->assertJsonPath('data.agencies.suspended', fn ($v) => $v >= 1)
            ->assertJsonPath('data.properties.published', fn ($v) => $v >= 3)
            ->assertJsonPath('data.properties.pending_review', fn ($v) => $v >= 2);
    }
}
