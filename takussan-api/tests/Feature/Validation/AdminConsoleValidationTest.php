<?php

namespace Tests\Feature\Validation;

use App\Models\Integration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-305 — les règles de validation de la console super-admin, **avant** leur déplacement en
 * FormRequest.
 *
 * Ces neuf endpoints validaient en ligne dans le contrôleur et **aucun test ne les faisait
 * rougir** : la mesure du 2026-08-17 a trouvé 30 des 120 sites de `$request->validate()` sans le
 * moindre test 422 sur leur URI. Déplacer une règle que rien ne couvre, c'est la perdre sans le
 * voir — le déplacement n'est pas un refactor pour le validateur, c'est une réécriture.
 *
 * Ces tests sont donc écrits et joués **verts sur le code d'avant**, puis rejoués après. Écrits
 * après, ils n'auraient prouvé que la cohérence du code avec lui-même.
 */
class AdminConsoleValidationTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_growth_report_rejects_an_unknown_metric(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/reports/growth?metric=chiffre-d-affaires')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['metric']);
    }

    public function test_growth_report_requires_a_metric(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/reports/growth')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['metric']);
    }

    public function test_growth_report_rejects_an_unknown_period_and_granularity(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/reports/growth?metric=users&period=99m&granularity=hour')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['period', 'granularity']);
    }

    public function test_revenue_report_rejects_an_unknown_period_and_granularity(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/reports/revenue?period=99m&granularity=hour')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['period', 'granularity']);
    }

    public function test_cohorts_report_rejects_an_unknown_basis_and_an_out_of_range_depth(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/reports/cohorts?cohort_basis=signup_week&depth=25')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['cohort_basis', 'depth']);
    }

    public function test_funnel_report_rejects_an_unknown_period(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/reports/funnel?period=12m')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['period']);
    }

    public function test_notification_template_preview_requires_a_supported_locale(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiPost('/api/admin/notification-templates/lease.created/mail/preview', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['locale']);

        $this->apiPost('/api/admin/notification-templates/lease.created/mail/preview', ['locale' => 'de'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['locale']);
    }

    public function test_notification_template_preview_rejects_a_non_array_sample(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiPost('/api/admin/notification-templates/lease.created/mail/preview', [
            'locale' => 'fr',
            'sample_data' => 'pas-un-tableau',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['sample_data']);
    }

    public function test_moderation_decision_requires_a_known_decision_and_a_bounded_reason(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiPost('/api/admin/moderation/review-1/decide', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['decision', 'reason']);

        $this->apiPost('/api/admin/moderation/review-1/decide', [
            'decision' => 'supprimer',
            'reason' => str_repeat('a', 1001),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['decision', 'reason']);
    }

    public function test_feature_flag_update_requires_a_boolean_and_bounds_the_rollout(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiPatch('/api/admin/feature-flags/advanced_search', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['enabled']);

        $this->apiPatch('/api/admin/feature-flags/advanced_search', [
            'enabled' => true,
            'segments' => [
                'roles' => [['imbriqué']],
                'agency_ids' => ['pas-un-entier'],
                'rollout_percentage' => 101,
            ],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors([
                'segments.roles.0',
                'segments.agency_ids.0',
                'segments.rollout_percentage',
            ]);
    }

    public function test_feature_flag_override_requires_a_boolean(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiPost('/api/admin/feature-flags/advanced_search/override', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['enabled']);

        $this->apiPost('/api/admin/feature-flags/advanced_search/override', ['enabled' => 'peut-être'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['enabled']);
    }

    public function test_admin_integration_update_rejects_scalars_where_arrays_are_expected(): void
    {
        $this->apiActingAsRole('super_admin');
        $integration = Integration::factory()->create();

        $this->apiPatch("/api/admin/integrations/{$integration->id}", [
            'credentials' => 'pas-un-tableau',
            'is_active' => 'peut-être',
            'metadata' => 'pas-un-tableau',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['credentials', 'is_active', 'metadata']);
    }
}
