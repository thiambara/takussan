<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1066 (P62.02) — `POST /api/bookings` ne dit plus à un compte connecté quels clients et
 * quels biens existent. `exists:customers,id` et `exists:properties,id` rendaient 422 pour un
 * identifiant absent, là où un client tiers ou un bien privé rendait 403 ; et l'état d'un bien
 * (brouillon, vendu…) se jugeait avant sa visibilité. L'absent reçoit désormais la réponse du
 * refus, et l'appelant hors personnel voit la visibilité jugée avant l'état (modèle de TCK-599).
 */
class BookingExistenceOracleTest extends TestCase
{
    use RefreshDatabase;

    private const ABSENT = 99999999;

    private Agency $tierce;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tierce = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->create());
    }

    private function rental(array $attributes = []): Property
    {
        return Property::factory()->create($attributes + [
            'agency_id' => $this->tierce->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);
    }

    private function book(int $propertyId, ?int $customerId = null): TestResponse
    {
        return $this->postJson('/api/bookings', array_filter([
            'property_id' => $propertyId,
            'customer_id' => $customerId,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]));
    }

    /** @return array{0: int, 1: mixed} */
    private function verdict(TestResponse $response): array
    {
        return [$response->status(), $response->json()];
    }

    public function test_un_client_absent_recoit_la_reponse_d_un_client_tiers(): void
    {
        $property = $this->rental();
        $tiers = Customer::factory()->create(['agency_id' => $this->tierce->id]);

        $deTiers = $this->verdict($this->book($property->id, $tiers->id));
        $absent = $this->verdict($this->book($property->id, self::ABSENT));

        $this->assertSame(403, $deTiers[0]);
        $this->assertSame($deTiers, $absent);
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_un_bien_absent_brouillon_ou_prive_recoit_la_meme_reponse(): void
    {
        $prive = $this->verdict($this->book($this->rental(['visibility' => PropertyVisibility::Private])->id));
        $brouillon = $this->verdict($this->book($this->rental(['status' => PropertyStatus::Draft, 'published_at' => null])->id));
        $vendu = $this->verdict($this->book($this->rental(['status' => PropertyStatus::Sold])->id));
        $absent = $this->verdict($this->book(self::ABSENT));

        $this->assertSame(403, $prive[0]);
        $this->assertSame('booking.property_unavailable', $prive[1]['code'] ?? null);
        $this->assertSame($prive, $brouillon);
        $this->assertSame($prive, $vendu);
        $this->assertSame($prive, $absent);
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_le_personnel_garde_le_refus_d_etat_sur_un_bien_de_son_agence(): void
    {
        $agent = User::factory()->withAgentProfile($this->tierce)->create();
        Sanctum::actingAs($agent);
        $customer = Customer::factory()->create(['agency_id' => $this->tierce->id]);

        $this->book($this->rental(['status' => PropertyStatus::Draft, 'published_at' => null])->id, $customer->id)
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking.property_unavailable');
    }

    public function test_un_identifiant_non_entier_reste_refuse_en_422(): void
    {
        $this->postJson('/api/bookings', ['property_id' => 'abc', 'customer_id' => 'xyz'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['property_id', 'customer_id']);
    }
}
