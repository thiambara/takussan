<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-807 (piste P21.05) — les listes des baux, des reversements et des réservations refusent un
 * `include=` que leur ressource n'émet pas.
 *
 * Avant, `include=landlord` sur `/api/leases` rendait 200 : la relation était chargée en base, puis
 * absente de la réponse, et l'appelant la lisait comme vide. Spatie refuse désormais l'include
 * inconnu (400), ce que le versant « permis » distingue d'un refus général.
 */
class IncludeNonEmisRefuseTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $agency->id]);
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
        ]);
        Payout::factory()->create(['landlord_id' => $this->owner->id, 'lease_id' => $lease->id, 'agency_id' => $agency->id]);
        Booking::factory()->create(['property_id' => $property->id, 'created_by_id' => $this->owner->id]);

        Sanctum::actingAs($this->owner);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function includesNonEmis(): array
    {
        return [
            'bail landlord' => ['/api/leases', 'landlord'],
            'bail agency' => ['/api/leases', 'agency'],
            'bail agent' => ['/api/leases', 'agent'],
            'bail guarantor' => ['/api/leases', 'guarantor'],
            'bail onboardingChecklist' => ['/api/leases', 'onboardingChecklist'],
            'reversement lease' => ['/api/payouts', 'lease'],
            'reversement booking' => ['/api/payouts', 'booking'],
            'reversement agency' => ['/api/payouts', 'agency'],
            'reversement landlord' => ['/api/payouts', 'landlord'],
            'reversement approver' => ['/api/payouts', 'approver'],
            'reversement processor' => ['/api/payouts', 'processor'],
            'réservation agency' => ['/api/bookings', 'agency'],
        ];
    }

    #[DataProvider('includesNonEmis')]
    public function test_un_include_que_la_ressource_n_emet_pas_est_refuse(string $route, string $relation): void
    {
        $this->getJson("{$route}?include={$relation}")->assertStatus(400);
    }

    public function test_les_includes_emis_restent_permis_et_sont_rendus(): void
    {
        $this->getJson('/api/leases?include=property,tenant')
            ->assertOk()
            ->assertJsonStructure(['data' => [['property', 'tenant']]]);

        $this->getJson('/api/payouts?include=issuer')->assertOk();

        $this->getJson('/api/bookings?include=property,customer')
            ->assertOk()
            ->assertJsonStructure(['data' => [['property', 'customer']]]);
    }
}
