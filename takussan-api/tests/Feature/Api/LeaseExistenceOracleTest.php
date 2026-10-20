<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1068 (P62.01) — `POST /api/leases` ne dit plus à un compte connecté quels clients, garants,
 * biens et réservations existent. Les `exists:` du FormRequest se jugeaient avant toute
 * autorisation : un identifiant absent rendait 422 sur son champ, un identifiant tiers passait la
 * validation. L'existence se juge désormais après l'autorisation, avec la réponse du refus
 * (modèle de TCK-599).
 */
class LeaseExistenceOracleTest extends TestCase
{
    use RefreshDatabase;

    private const ABSENT = 99999999;

    private Agency $tierce;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tierce = Agency::factory()->create();
    }

    /** @param  array<string, mixed>  $overrides */
    private function lease(array $overrides): TestResponse
    {
        return $this->postJson('/api/leases', $overrides + [
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 400000,
        ]);
    }

    /** @return array{0: int, 1: mixed} */
    private function verdict(TestResponse $response): array
    {
        return [$response->status(), $response->json()];
    }

    public function test_hors_agence_un_client_ou_un_garant_absent_ne_se_distingue_pas_d_un_tiers(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $property = Property::factory()->create(['agency_id' => $this->tierce->id]);
        $tiers = Customer::factory()->create(['agency_id' => $this->tierce->id]);
        $garantTiers = Guarantor::factory()->create();

        // `type` invalide exprès : la mesure du constat lisait les champs que la validation nomme.
        $deTiers = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => $tiers->id, 'guarantor_id' => $garantTiers->id, 'type' => 'x']));
        $absents = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => self::ABSENT, 'guarantor_id' => self::ABSENT, 'type' => 'x']));

        $this->assertSame(422, $deTiers[0]);
        $this->assertSame($deTiers, $absents);

        $deTiers = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => $tiers->id, 'guarantor_id' => $garantTiers->id]));
        $absents = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => self::ABSENT, 'guarantor_id' => self::ABSENT]));

        $this->assertSame(403, $deTiers[0]);
        $this->assertSame($deTiers, $absents);
        $this->assertDatabaseCount('leases', 0);
    }

    public function test_le_bailleur_recoit_le_meme_refus_pour_un_client_ou_un_garant_absent_ou_tiers(): void
    {
        $landlord = User::factory()->create();
        Sanctum::actingAs($landlord);
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $sien = Customer::factory()->create(['added_by_id' => $landlord->id]);

        $clientTiers = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => Customer::factory()->create(['agency_id' => $this->tierce->id])->id]));
        $clientAbsent = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => self::ABSENT]));
        $garantTiers = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => $sien->id, 'guarantor_id' => Guarantor::factory()->create()->id]));
        $garantAbsent = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => $sien->id, 'guarantor_id' => self::ABSENT]));

        $this->assertSame(403, $clientTiers[0]);
        $this->assertSame($clientTiers, $clientAbsent);
        $this->assertSame($clientTiers, $garantTiers);
        $this->assertSame($clientTiers, $garantAbsent);
        $this->assertDatabaseCount('leases', 0);
    }

    public function test_un_bien_absent_recoit_la_reponse_d_un_bien_tiers(): void
    {
        $landlord = User::factory()->create();
        Sanctum::actingAs($landlord);
        $sien = Customer::factory()->create(['added_by_id' => $landlord->id]);
        $tiers = Property::factory()->create(['agency_id' => $this->tierce->id]);

        $deTiers = $this->verdict($this->lease(['property_id' => $tiers->id, 'tenant_id' => $sien->id]));
        $absent = $this->verdict($this->lease(['property_id' => self::ABSENT, 'tenant_id' => $sien->id]));

        $this->assertSame(403, $deTiers[0]);
        $this->assertSame($deTiers, $absent);
    }

    public function test_une_reservation_d_un_autre_bien_recoit_la_reponse_d_une_reservation_absente(): void
    {
        $landlord = User::factory()->create();
        Sanctum::actingAs($landlord);
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $sien = Customer::factory()->create(['added_by_id' => $landlord->id]);
        $dAilleurs = Booking::factory()->create();

        $autreBien = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => $sien->id, 'booking_id' => $dAilleurs->id]));
        $absente = $this->verdict($this->lease(['property_id' => $property->id, 'tenant_id' => $sien->id, 'booking_id' => self::ABSENT]));

        $this->assertSame(422, $autreBien[0]);
        $this->assertSame($autreBien, $absente);
        $this->assertArrayHasKey('booking_id', $absente[1]['errors'] ?? []);

        // Hors agence, un bien tiers : la réservation n'est même plus jugée, le refus du bien prime.
        Sanctum::actingAs(User::factory()->create());
        $tiers = Property::factory()->create(['agency_id' => $this->tierce->id]);
        $saReservation = Booking::factory()->create(['property_id' => $tiers->id]);
        $existe = $this->verdict($this->lease(['property_id' => $tiers->id, 'tenant_id' => $sien->id, 'booking_id' => $saReservation->id, 'type' => 'x']));
        $nExistePas = $this->verdict($this->lease(['property_id' => $tiers->id, 'tenant_id' => $sien->id, 'booking_id' => self::ABSENT, 'type' => 'x']));
        $this->assertSame($existe, $nExistePas);
        $this->assertDatabaseCount('leases', 0);
    }

    public function test_la_reservation_du_bien_reste_acceptee(): void
    {
        $landlord = User::factory()->create();
        Sanctum::actingAs($landlord);
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $sien = Customer::factory()->create(['added_by_id' => $landlord->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);

        $this->lease(['property_id' => $property->id, 'tenant_id' => $sien->id, 'booking_id' => $booking->id])
            ->assertCreated();
        $this->assertDatabaseHas('leases', ['booking_id' => $booking->id]);
    }

    public function test_un_identifiant_non_entier_reste_refuse_en_422(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->lease(['property_id' => 'abc', 'tenant_id' => 'xyz', 'guarantor_id' => 'g', 'booking_id' => 'b'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['property_id', 'tenant_id', 'guarantor_id', 'booking_id']);
    }
}
