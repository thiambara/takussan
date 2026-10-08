<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\PlatformPayout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC11, AC18 côté API) — ce que la plateforme reverse à l'agence se lit avec
 * `agency.update_billing`. Avant : tout profil de l'agence le lisait, bailleur compris.
 */
class MePlatformPayoutAccessTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_ac11_owner_and_agent_profiles_get_403_the_admin_200(): void
    {
        $agency = Agency::factory()->create();
        $mine = PlatformPayout::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs(User::factory()->withOwnerProfile($agency)->create());
        $this->getJson('/api/me/payouts')->assertForbidden();

        Sanctum::actingAs($this->agencyAgent($agency));
        $this->getJson('/api/me/payouts')->assertForbidden();

        Sanctum::actingAs($this->agencyAdmin($agency));
        $this->getJson('/api/me/payouts')->assertOk()->assertJsonPath('data.0.id', $mine->id);
    }

    public function test_the_capability_is_read_not_the_role(): void
    {
        $agency = Agency::factory()->create();
        PlatformPayout::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($this->adminWithout($agency, Capability::AgencyUpdateBilling));
        $this->getJson('/api/me/payouts')->assertForbidden();

        Sanctum::actingAs($this->agentWith($agency, Capability::AgencyUpdateBilling));
        $this->getJson('/api/me/payouts')->assertOk();
    }

    public function test_ac18_the_admin_of_an_individual_agency_reads_its_platform_payouts(): void
    {
        $host = Agency::factory()->individual()->create();
        $payout = PlatformPayout::factory()->create(['agency_id' => $host->id]);

        Sanctum::actingAs($this->agencyAdmin($host));
        $this->getJson('/api/me/payouts')->assertOk()->assertJsonPath('data.0.id', $payout->id);
    }
}
