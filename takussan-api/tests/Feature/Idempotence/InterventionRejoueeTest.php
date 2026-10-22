<?php

namespace Tests\Feature\Idempotence;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1404 (P144.06, ADR-0072 lot 2) — le scénario mesuré : un locataire en bail actif signale un
 * problème, la réponse se perd, il renvoie. Il y avait deux interventions et deux notifications au
 * bailleur ; sous la même clé, une de chaque.
 */
class InterventionRejoueeTest extends TestCase
{
    use RefreshDatabase;

    public function test_une_intervention_rejouee_sous_la_meme_cle_n_est_ouverte_qu_une_fois(): void
    {
        $tenantUser = User::factory()->create();
        $property = Property::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $tenantUser->id]);
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $customer->id,
            'landlord_id' => $property->user_id,
            'status' => LeaseStatus::Active,
        ]);
        Sanctum::actingAs($tenantUser);
        $corps = [
            'property_id' => $property->id,
            'title' => 'Fuite sous l’évier',
            'description' => 'L’eau coule sous l’évier de la cuisine.',
            'category' => 'plumbing',
            'priority' => 'high',
        ];
        $cle = ['Idempotency-Key' => 'd9e8f7a6-5b4c-4d3e-8f2a-interv000001'];

        $premiere = $this->postJson('/api/maintenance-requests', $corps, $cle)->assertCreated();
        $notifications = DB::table('app_notifications')->count();
        $this->travel(30)->seconds();
        $this->postJson('/api/maintenance-requests', $corps, $cle)
            ->assertCreated()
            ->assertJsonPath('data.id', $premiere->json('data.id'));

        $this->assertSame(1, MaintenanceRequest::query()->count());
        $this->assertSame($notifications, DB::table('app_notifications')->count(), 'aucune seconde notification');
        $this->assertGreaterThan(0, $notifications, 'témoin : le premier envoi prévient bien');
    }
}
