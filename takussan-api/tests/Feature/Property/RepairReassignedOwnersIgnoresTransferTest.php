<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-999 (AC4 ; ADR-0036, amendement du 2026-10-19 ; ADR-0059 § 4) — « changer le titulaire » écrit
 * `user_id` journal du modèle coupé, sous son propre évènement (`owner_transferred`). Sans cela,
 * `properties:repair-reassigned-owners` lirait le transfert comme une réattribution de l'ancien
 * « Réattribuer » et le listerait, ou le déferait.
 */
class RepairReassignedOwnersIgnoresTransferTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_ac4_la_reparation_ne_relit_pas_le_transfert(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $admin = $this->agencyAdmin($agency);
        $b = User::factory()->withOwnerProfile($agency)->create();
        $bien = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id]);
        $brouillon = Lease::factory()->create([
            'property_id' => $bien->id,
            'agency_id' => $agency->id,
            'landlord_id' => $agent->id,
            'status' => LeaseStatus::Draft,
        ]);

        $this->actingAsApi($admin)->putJson("/api/properties/{$bien->id}/owner", ['owner_id' => $b->id])->assertOk();

        $this->artisan('properties:repair-reassigned-owners', ['--dry-run' => true])
            ->doesntExpectOutputToContain("property={$bien->id} ")
            ->expectsOutputToContain('owners_to_review=0')
            ->assertSuccessful();
        $this->artisan('properties:repair-reassigned-owners')->assertSuccessful();

        $this->assertSame($b->id, (int) $bien->fresh()->user_id);
        $this->assertSame($b->id, (int) $brouillon->fresh()->landlord_id);
    }
}
