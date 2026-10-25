<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2285 (P226.01, décision du porteur) — le locataire, le garant et le client d'un bail ou
 * d'une réservation sont des fiches de l'agence du bien quand le bien a une agence, en plus de
 * `can('view')`.
 *
 * Le compte agent de A et de B, sous l'indice `agent:B`, lisait la fiche de A qu'il avait ajoutée
 * (`CustomerPolicy::view`, `GuarantorPolicy::view`) : il la rattachait à un bail ou à une
 * réservation du bien de B, et le personnel de B la lisait ensuite par le bail.
 *
 * Témoins : la fiche de B passe, et un bien sans agence ne change pas. La fiche sans agence d'un
 * client du tunnel (`CustomerService::findOrCreateFromUser`) n'est pas davantage refusée
 * qu'avant : le personnel de B ne la lisait déjà pas, et le client réserve toujours pour lui.
 */
class ContactDeLAgenceDuBienTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const RESERVABLE = ['contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Daily];

    private Agency $a;

    private Agency $b;

    private User $double;

    private Property $bienB;

    private Customer $clientA;

    private Customer $clientB;

    private Guarantor $garantA;

    private Guarantor $garantB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = Agency::factory()->create();
        $this->b = Agency::factory()->create();

        $this->double = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $this->double->id, 'agency_id' => $this->a->id]);
        $profilB = AgentProfile::factory()->create(['user_id' => $this->double->id, 'agency_id' => $this->b->id]);
        $this->withHeaders(['X-Active-Profile-Hint' => "agent:{$profilB->id}"]);

        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->b->id]);
        $this->bienB = Property::factory()->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->b->id,
            'visibility' => PropertyVisibility::Public,
            ...self::RESERVABLE,
        ]);

        $this->clientA = Customer::factory()->create(['agency_id' => $this->a->id, 'added_by_id' => $this->double->id]);
        $this->clientB = Customer::factory()->create(['agency_id' => $this->b->id, 'added_by_id' => $this->double->id]);
        $this->garantA = Guarantor::factory()->create(['agency_id' => $this->a->id, 'added_by_id' => $this->double->id]);
        $this->garantB = Guarantor::factory()->create(['agency_id' => $this->b->id, 'added_by_id' => $this->double->id]);
    }

    /** @return array<string, mixed> */
    private function bail(Property $bien, Customer $locataire, array $extra = []): array
    {
        return $extra + [
            'property_id' => $bien->id,
            'tenant_id' => $locataire->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 300000,
        ];
    }

    /** @return array<string, mixed> */
    private function reservation(Property $bien, array $extra = []): array
    {
        return $extra + [
            'property_id' => $bien->id,
            'start_date' => now()->addDays(2)->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
        ];
    }

    private function bailBrouillon(Property $bien, Customer $locataire): Lease
    {
        return Lease::factory()->create([
            'property_id' => $bien->id,
            'agency_id' => $bien->agency_id,
            'landlord_id' => $bien->user_id,
            'tenant_id' => $locataire->id,
            'status' => LeaseStatus::Draft,
        ]);
    }

    public function test_un_bail_du_bien_de_b_ne_prend_pas_le_locataire_de_a(): void
    {
        $this->actingAsApi($this->double)
            ->postJson('/api/leases', $this->bail($this->bienB, $this->clientA))
            ->assertForbidden();

        $this->assertSame(0, Lease::query()->count());
    }

    public function test_un_bail_du_bien_de_b_ne_prend_pas_le_garant_de_a(): void
    {
        $this->actingAsApi($this->double)
            ->postJson('/api/leases', $this->bail($this->bienB, $this->clientB, ['guarantor_id' => $this->garantA->id]))
            ->assertForbidden();

        $this->assertSame(0, Lease::query()->count());
    }

    public function test_une_reservation_du_bien_de_b_ne_prend_pas_le_client_de_a(): void
    {
        $this->actingAsApi($this->double)
            ->postJson('/api/bookings', $this->reservation($this->bienB, ['customer_id' => $this->clientA->id]))
            ->assertForbidden();

        $this->assertSame(0, Booking::query()->count());
    }

    public function test_le_bail_du_bien_de_b_ne_se_voit_pas_rattacher_le_garant_de_a(): void
    {
        $bail = $this->bailBrouillon($this->bienB, $this->clientB);

        $this->actingAsApi($this->double)
            ->postJson("/api/leases/{$bail->id}/guarantors", ['guarantor_id' => $this->garantA->id])
            ->assertForbidden();

        $this->assertSame(0, $bail->guarantors()->count());
    }

    public function test_temoin_les_fiches_de_b_passent(): void
    {
        $this->actingAsApi($this->double)
            ->postJson('/api/leases', $this->bail($this->bienB, $this->clientB, ['guarantor_id' => $this->garantB->id]))
            ->assertCreated();
        $this->postJson('/api/bookings', $this->reservation($this->bienB, ['customer_id' => $this->clientB->id]))
            ->assertCreated();

        $bail = $this->bailBrouillon($this->bienB, $this->clientB);
        $this->postJson("/api/leases/{$bail->id}/guarantors", ['guarantor_id' => $this->garantB->id])
            ->assertCreated();
    }

    /** Un bien sans agence ne change pas : son bailleur y rattache toujours les fiches qu'il lit. */
    public function test_temoin_un_bien_sans_agence_ne_change_pas(): void
    {
        $sansAgence = Property::factory()->create(['user_id' => $this->double->id, 'agency_id' => null]);

        $this->actingAsApi($this->double)
            ->postJson('/api/leases', $this->bail($sansAgence, $this->clientA, ['guarantor_id' => $this->garantA->id]))
            ->assertCreated();

        $bail = $this->bailBrouillon($sansAgence, $this->clientA);
        $this->postJson("/api/leases/{$bail->id}/guarantors", ['guarantor_id' => $this->garantB->id])
            ->assertCreated();
    }

    /**
     * La fiche sans agence d'un client du tunnel : refusée au personnel de B avant comme après (il
     * ne la lisait pas), et le client réserve toujours pour lui, qu'il la nomme ou non.
     */
    public function test_temoin_la_fiche_du_tunnel_n_est_pas_davantage_refusee(): void
    {
        $client = User::factory()->create();
        $this->actingAsApi($client)
            ->postJson('/api/bookings', $this->reservation($this->bienB))
            ->assertCreated();
        $fiche = Customer::query()->where('user_id', $client->id)->firstOrFail();
        $this->assertNull($fiche->agency_id);
        $this->assertSame($client->id, $fiche->added_by_id);

        $this->postJson('/api/bookings', $this->reservation($this->bienB, [
            'customer_id' => $fiche->id,
            'start_date' => now()->addDays(10)->toDateString(),
            'end_date' => now()->addDays(12)->toDateString(),
        ]))->assertCreated();

        $personnelB = $this->agencyAgent($this->b);
        $this->actingAsApi($personnelB)
            ->postJson('/api/leases', $this->bail($this->bienB, $fiche))
            ->assertForbidden();
        $this->postJson('/api/bookings', $this->reservation($this->bienB, [
            'customer_id' => $fiche->id,
            'start_date' => now()->addDays(20)->toDateString(),
            'end_date' => now()->addDays(22)->toDateString(),
        ]))->assertForbidden();
    }
}
