<?php

namespace Tests\Feature\Api\Admin;

use App\Models\FeatureFlag;
use App\Models\User;
use App\Services\Features\FeatureFlagEvaluator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

class FeatureFlagTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_unknown_flag_is_fail_closed(): void
    {
        $user = User::factory()->create();

        $this->assertFalse(app(FeatureFlagEvaluator::class)->isEnabled('unknown_flag', $user));
    }

    public function test_segments_and_rollout_are_stable(): void
    {
        $agencyAdmin = $this->actingAsRole('agency_admin');
        FeatureFlag::create([
            'key' => 'advanced_search',
            'label' => 'Advanced search',
            'description' => 'x',
            'enabled' => true,
            'segments_json' => ['roles' => ['agency_admin']],
        ]);
        FeatureFlag::create([
            'key' => 'property_compare',
            'label' => 'Compare',
            'description' => 'x',
            'enabled' => true,
            'segments_json' => ['rollout_percentage' => 50],
        ]);
        $evaluator = app(FeatureFlagEvaluator::class);

        $this->assertTrue($evaluator->isEnabled('advanced_search', $agencyAdmin));
        $this->assertSame(
            $evaluator->isEnabled('property_compare', $agencyAdmin),
            $evaluator->isEnabled('property_compare', $agencyAdmin),
        );
    }

    public function test_me_endpoint_exposes_only_client_visible_values_and_override_is_isolated(): void
    {
        $superAdmin = $this->actingAsRole('super_admin');
        $other = User::factory()->create();
        FeatureFlag::create([
            'key' => 'property_compare',
            'label' => 'Compare',
            'description' => 'Internal description',
            'enabled' => false,
            'segments_json' => [],
        ]);

        $this->postJson('/api/admin/feature-flags/property_compare/override', ['enabled' => true])
            ->assertOk()
            ->assertJsonPath('data.enabled', true);

        $this->getJson('/api/feature-flags/me')
            ->assertOk()
            ->assertJsonPath('data.property_compare', true)
            ->assertJsonMissing(['Internal description']);

        $this->assertFalse(app(FeatureFlagEvaluator::class)->isEnabled('property_compare', $other));
        $this->assertTrue(app(FeatureFlagEvaluator::class)->isEnabled('property_compare', $superAdmin));
    }

    public function test_agency_admin_is_forbidden_and_mutation_is_audited(): void
    {
        $this->actingAsRole('agency_admin');
        $this->patchJson('/api/admin/feature-flags/property_compare', ['enabled' => true])->assertForbidden();

        $this->actingAsRole('super_admin');
        $this->patchJson('/api/admin/feature-flags/property_compare', [
            'enabled' => true,
            'segments' => ['rollout_percentage' => 25],
        ])->assertOk()
            ->assertJsonPath('data.0.key', 'property_compare');

        $this->assertTrue(Activity::query()->where('event', 'super_admin_feature_flag_updated')->exists());
    }
}
