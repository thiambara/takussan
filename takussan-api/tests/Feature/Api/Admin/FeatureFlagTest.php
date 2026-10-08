<?php

namespace Tests\Feature\Api\Admin;

use App\Domain\Features\Flag;
use App\Models\FeatureFlag;
use App\Models\User;
use App\Services\Features\FeatureFlagEvaluator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Drapeaux de fonctionnalité. TCK-600 : le catalogue est VIDE — ses trois entrées n'avaient aucun
 * lecteur. Le mécanisme (segments, déploiement progressif) reste éprouvé sur une ligne stockée,
 * par `FeatureFlagEvaluator::evaluate()`.
 */
class FeatureFlagTest extends TestCase
{
    use RefreshDatabase;

    public function test_unknown_flag_is_fail_closed(): void
    {
        $user = User::factory()->create();
        FeatureFlag::create(['key' => 'unknown_flag', 'label' => 'x', 'enabled' => true, 'segments_json' => []]);

        $this->assertFalse(app(FeatureFlagEvaluator::class)->isEnabled('unknown_flag', $user));
    }

    public function test_segments_and_rollout_are_stable(): void
    {
        $agencyAdmin = $this->actingAsRole('agency_admin');
        $evaluator = app(FeatureFlagEvaluator::class);
        $parRole = new FeatureFlag(['key' => 'k_role', 'enabled' => true, 'segments_json' => ['roles' => ['agency_admin']]]);
        $progressif = new FeatureFlag(['key' => 'k_rollout', 'enabled' => true, 'segments_json' => ['rollout_percentage' => 50]]);
        $eteint = new FeatureFlag(['key' => 'k_off', 'enabled' => false, 'segments_json' => []]);

        $this->assertTrue($evaluator->evaluate($parRole, $agencyAdmin));
        $this->assertFalse($evaluator->evaluate($parRole, User::factory()->create()));
        $this->assertSame($evaluator->evaluate($progressif, $agencyAdmin), $evaluator->evaluate($progressif, $agencyAdmin));
        $this->assertSame($evaluator->bucket('k_rollout', $agencyAdmin->id) < 50, $evaluator->evaluate($progressif, $agencyAdmin));
        $this->assertFalse($evaluator->evaluate($eteint, $agencyAdmin));
        $this->assertFalse($evaluator->evaluate($parRole, null));
    }

    /** AC15 — le catalogue est vide et ne sert ni libellé ni description. */
    public function test_the_catalogue_is_empty_and_carries_no_label(): void
    {
        $this->assertSame([], Flag::cases());
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/feature-flags')->assertOk()->assertExactJson(['data' => []]);
        $this->getJson('/api/feature-flags/me')->assertOk()->assertJsonPath('data', []);
    }

    public function test_any_key_is_unknown_to_the_console(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/feature-flags/property_compare', ['enabled' => true])
            ->assertNotFound()
            ->assertJsonPath('code', 'feature_flag.unknown');
        $this->postJson('/api/admin/feature-flags/property_compare/override', ['enabled' => true])
            ->assertNotFound();
        $this->assertSame(0, FeatureFlag::query()->count());
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $this->actingAsRole('agency_admin');
        $this->patchJson('/api/admin/feature-flags/property_compare', ['enabled' => true])->assertForbidden();
    }
}
