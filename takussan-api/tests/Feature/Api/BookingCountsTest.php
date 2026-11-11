<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2593 — `GET /api/bookings/counts` : un compte par nature × statut, sous la portée de
 * l'index et ses filtres, en une requête groupée. Chaque case égale le `meta.total` de l'index
 * filtré sur la même nature et le même statut.
 */
class BookingCountsTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Property $mine;

    private User $client;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->mine = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id, 'title' => 'Villa des Almadies']);
        $other = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Studio Mermoz']);

        $this->client = User::factory()->create();
        $clientCard = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->client->id, 'first_name' => 'Ousmane', 'last_name' => 'Ba']);
        $someone = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => null, 'first_name' => 'Awa', 'last_name' => 'Diop']);

        // Une répartition irrégulière : chaque case a son propre compte, plusieurs sont vides.
        $kinds = BookingKind::cases();
        $statuses = BookingStatus::cases();
        $n = 0;
        foreach ($kinds as $i => $kind) {
            foreach ($statuses as $j => $status) {
                for ($k = 0; $k < ($i + $j) % 3; $k++) {
                    $this->booking([$this->mine, $other][$n % 2], [$clientCard, $someone][$n % 3 === 0 ? 0 : 1], $kind, $status);
                    $n++;
                }
            }
        }

        // Hors portée : une autre agence, et une réservation supprimée.
        $autre = Agency::factory()->create();
        $ailleurs = Property::factory()->create(['agency_id' => $autre->id]);
        $this->booking($ailleurs, Customer::factory()->create(['agency_id' => $autre->id, 'user_id' => null]), BookingKind::Offer, BookingStatus::Pending, $autre);
        $this->booking($this->mine, $someone, BookingKind::Offer, BookingStatus::Pending)->delete();
    }

    private function booking(Property $property, Customer $customer, BookingKind $kind, BookingStatus $status, ?Agency $agency = null): Booking
    {
        return Booking::factory()->create([
            'property_id' => $property->id,
            'agency_id' => ($agency ?? $this->agency)->id,
            'customer_id' => $customer->id,
            'created_by_id' => User::factory()->create()->id,
            'kind' => $kind,
            'status' => $status,
        ]);
    }

    private function assertCountsMatchTheIndex(string $query = ''): void
    {
        $counts = $this->getJson('/api/bookings/counts'.($query !== '' ? '?'.$query : ''))->assertOk()->json('data');

        $this->assertSame(
            array_map(fn (BookingKind $k) => $k->value, BookingKind::cases()),
            array_keys($counts),
        );
        $nonZero = 0;
        foreach (BookingKind::cases() as $kind) {
            $this->assertSame(
                array_map(fn (BookingStatus $s) => $s->value, BookingStatus::cases()),
                array_keys($counts[$kind->value]),
            );
            foreach (BookingStatus::cases() as $status) {
                $total = $this->getJson('/api/bookings?per_page=1&filter[kind]='.$kind->value.'&filter[status]='.$status->value.($query !== '' ? '&'.$query : ''))
                    ->assertOk()->json('meta.total');
                $this->assertSame($total, $counts[$kind->value][$status->value], "{$kind->value} × {$status->value} ({$query})");
                $nonZero += $total > 0 ? 1 : 0;
            }
        }
        $this->assertGreaterThan(0, $nonZero, 'une comparaison de zéros ne prouve rien');
    }

    public function test_ac2_every_kind_and_status_equals_the_index_total_for_the_staff(): void
    {
        Sanctum::actingAs($this->agent);

        $this->assertCountsMatchTheIndex();
        $this->assertCountsMatchTheIndex('filter[managed_by]=me');
        $this->assertCountsMatchTheIndex('filter[search]=almadies');
        $this->assertCountsMatchTheIndex('filter[property_id]='.$this->mine->id);
    }

    public function test_the_staff_counts_their_agency_only(): void
    {
        Sanctum::actingAs($this->agent);

        $sum = collect($this->getJson('/api/bookings/counts')->assertOk()->json('data'))->flatten()->sum();
        $this->assertSame(Booking::query()->where('agency_id', $this->agency->id)->count(), $sum);
    }

    public function test_the_customer_counts_only_their_own_bookings(): void
    {
        Sanctum::actingAs($this->client);

        $this->assertCountsMatchTheIndex();
        $own = Booking::query()->whereHas('customer', fn ($c) => $c->where('user_id', $this->client->id))->count();
        $this->assertGreaterThan(0, $own);
        $this->assertSame($own, collect($this->getJson('/api/bookings/counts')->json('data'))->flatten()->sum());
    }

    public function test_the_counts_are_one_grouped_query(): void
    {
        Sanctum::actingAs($this->agent);
        $this->getJson('/api/bookings/counts')->assertOk(); // échauffement : profil actif, résolveur

        DB::enableQueryLog();
        $this->getJson('/api/bookings/counts?filter[managed_by]=me')->assertOk();
        $onBookings = collect(DB::getQueryLog())->pluck('query')
            ->filter(fn (string $sql) => preg_match('/\bfrom "bookings"/', $sql) === 1)->values();
        DB::disableQueryLog();

        $this->assertCount(1, $onBookings, $onBookings->implode("\n"));
        $this->assertStringContainsString('group by', strtolower($onBookings[0]));
    }

    public function test_an_unknown_filter_is_refused_like_the_index(): void
    {
        Sanctum::actingAs($this->agent);

        $this->getJson('/api/bookings?filter[nope]=1')->assertStatus(400);
        $this->getJson('/api/bookings/counts?filter[nope]=1')->assertStatus(400);
    }

    public function test_a_guest_is_refused(): void
    {
        $this->getJson('/api/bookings/counts')->assertUnauthorized();
    }
}
