<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FormeDuShow;
use Tests\TestCase;

/**
 * TCK-1777 (P95.04) — `PATCH /api/me/profiles/{id}/availability` rend la projection de
 * `GET /api/me/profiles/{id}` (ADR-0071). Elle ne rendait que `{id, available_slots}`, sans les
 * métiers, les zones ni les tarifs que le `show` porte.
 */
class ServiceProviderAvailabilityMatchesShowTest extends TestCase
{
    use FormeDuShow;
    use RefreshDatabase;

    public function test_availability_write_returns_the_show_projection(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'specialties' => ['plumbing'],
            'service_areas' => ['Dakar'],
            'hourly_rate_min' => 7500,
            'metadata' => ['visit_fee' => 2000.0],
        ]);
        Sanctum::actingAs($user);

        $slots = [['day' => 'monday', 'from' => '08:00', 'to' => '12:00']];

        $ecriture = $this->patchJson("/api/me/profiles/{$sp->id}/availability", ['available_slots' => $slots])
            ->assertOk()
            ->json('data');
        $show = $this->getJson("/api/me/profiles/{$sp->id}")->assertOk()->json('data');

        $this->assertEcritureALaFormeDuShow($ecriture, $show, geste: 'updateAvailability');
        $this->assertSame(['plumbing'], $ecriture['trades']);
        $this->assertSame(['Dakar'], $ecriture['intervention_zones']);
        $this->assertEquals($show['hourly_rate'], $ecriture['hourly_rate']);
        $this->assertEquals($show['visit_fee'], $ecriture['visit_fee']);
        $this->assertSame($slots, $ecriture['available_slots']);
    }
}
