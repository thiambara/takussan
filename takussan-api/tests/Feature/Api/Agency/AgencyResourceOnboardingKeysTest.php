<?php

namespace Tests\Feature\Api\Agency;

use App\Http\Resources\AgencyResource;
use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * TCK-966 (P47.07) — l'assistant et la création automatique d'un espace écrivaient dans
 * `agencies.settings` quatre clés que rien ne lit (`primary_city`, `primary_property_type`,
 * `onboarding_source`, `payment.preferred_provider`). Elles ne s'écrivent plus, et celles qu'une
 * agence porte encore ne sortent plus par `AgencyResource` ; les autres réglages sortent tels quels.
 */
class AgencyResourceOnboardingKeysTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_cles_de_l_assistant_ne_sortent_plus(): void
    {
        $agency = Agency::factory()->create(['settings' => [
            'primary_city' => 'Dakar',
            'primary_property_type' => 'apartment',
            'onboarding_source' => 'host_individual_wizard',
            'payment' => ['preferred_provider' => 'wave'],
            'watermark_opacity' => 50,
            'late_fee_online_collection' => true,
        ]]);

        $settings = AgencyResource::make($agency)->resolve(Request::create('/'))['settings'];

        $this->assertSame(['watermark_opacity' => 50, 'late_fee_online_collection' => true], $settings);
    }

    public function test_une_agence_sans_reglage_rend_toujours_null(): void
    {
        $agency = Agency::factory()->create(['settings' => null]);

        $this->assertNull(AgencyResource::make($agency)->resolve(Request::create('/'))['settings']);
    }
}
