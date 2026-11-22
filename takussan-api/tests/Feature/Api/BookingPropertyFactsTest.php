<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2870 (ADR-0110, maquette e4 « En vente depuis 47 jours · 6 visites · première offre reçue ») —
 * ce que le bien dit autour d'une réservation, au seul personnel de l'agence :
 * `other_pending_on_property`, `property_visits_count`, `offer_rank`. Le client ne reçoit aucune
 * de ces clés.
 */
class BookingPropertyFactsTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
    }

    private function bien(ContractType $contract): Property
    {
        return Property::factory()->create([
            'agency_id' => $this->agency->id, 'contract_type' => $contract,
            'rent_period' => $contract === ContractType::Rent ? RentPeriod::Monthly : null,
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function reservation(Property $bien, BookingKind $kind, ?User $client = null, array $extra = []): Booking
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $client?->id]);

        return Booking::factory()->create($extra + [
            'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'customer_id' => $customer->id,
            'kind' => $kind, 'status' => BookingStatus::Pending,
        ]);
    }

    public function test_ac3_two_pending_applications_each_see_the_other_and_the_client_does_not(): void
    {
        $bien = $this->bien(ContractType::Rent);
        $client = User::factory()->create();
        $a = $this->reservation($bien, BookingKind::Application, $client);
        $this->reservation($bien, BookingKind::Application);
        // Ne comptent pas : une candidature refusée, une supprimée, une sur un autre bien.
        $this->reservation($bien, BookingKind::Application, null, ['status' => BookingStatus::Rejected]);
        $this->reservation($bien, BookingKind::Application)->delete();
        $this->reservation($this->bien(ContractType::Rent), BookingKind::Application);

        Sanctum::actingAs($this->agent);
        $rows = collect($this->getJson("/api/bookings?filter[property_id]={$bien->id}&filter[status]=pending")->assertOk()->json('data'));
        $this->assertCount(2, $rows);
        foreach ($rows as $row) {
            $this->assertSame(1, $row['other_pending_on_property']);
            $this->assertArrayNotHasKey('offer_rank', $row, 'une candidature n\'a pas de rang d\'offre');
        }
        $this->assertSame(1, $this->getJson("/api/bookings/{$a->id}")->assertOk()->json('data.other_pending_on_property'));

        Sanctum::actingAs($client);
        foreach ([
            $this->getJson('/api/bookings')->assertOk()->json('data.0'),
            $this->getJson("/api/bookings/{$a->id}")->assertOk()->json('data'),
        ] as $row) {
            $this->assertSame($a->id, $row['id']);
            $this->assertArrayNotHasKey('other_pending_on_property', $row);
            $this->assertArrayNotHasKey('property_visits_count', $row);
            $this->assertArrayNotHasKey('offer_rank', $row);
        }
    }

    public function test_ac5_the_visits_of_the_property_and_the_rank_of_each_offer(): void
    {
        $bien = $this->bien(ContractType::Sale);
        // Six visites terminées, tous visiteurs ; une annulée et une à venir ne comptent pas.
        PropertyVisit::factory()->count(6)->create(['property_id' => $bien->id, 'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDays(5)]);
        PropertyVisit::factory()->create(['property_id' => $bien->id, 'status' => VisitStatus::Cancelled, 'scheduled_at' => now()->subDays(4)]);
        PropertyVisit::factory()->create(['property_id' => $bien->id, 'status' => VisitStatus::Scheduled, 'scheduled_at' => now()->addDays(2)]);

        // Même seconde de création : le rang se départage par l'id.
        $this->freezeTime();
        $premiere = $this->reservation($bien, BookingKind::Offer);
        $deuxieme = $this->reservation($bien, BookingKind::Offer, null, ['status' => BookingStatus::Rejected]);
        $this->travel(1)->hours();
        $troisieme = $this->reservation($bien, BookingKind::Offer);

        Sanctum::actingAs($this->agent);
        $premiereLue = $this->getJson("/api/bookings/{$premiere->id}")->assertOk()->json('data');
        $this->assertSame(6, $premiereLue['property_visits_count']);
        $this->assertSame(1, $premiereLue['offer_rank']);
        // Le rang se calcule sur toutes les offres du bien, pas sur la seule ligne lue.
        $this->assertSame(2, $this->getJson("/api/bookings/{$deuxieme->id}")->assertOk()->json('data.offer_rank'));
        $this->assertSame(3, $this->getJson("/api/bookings/{$troisieme->id}")->assertOk()->json('data.offer_rank'));

        $rangs = collect($this->getJson("/api/bookings?filter[property_id]={$bien->id}&fields[bookings]=id,agency_id")->assertOk()->json('data'))
            ->mapWithKeys(fn (array $r): array => [$r['id'] => $r['offer_rank']]);
        $this->assertSame([$premiere->id => 1, $deuxieme->id => 2, $troisieme->id => 3], $rangs->sortKeys()->all());
    }
}
