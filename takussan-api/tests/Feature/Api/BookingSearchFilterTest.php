<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2593 — `filter[search]` sur la liste des réservations : la référence, le nom et le
 * téléphone du client, le titre du bien. Une condition SQL sous la portée de l'index, jamais
 * Meilisearch, jamais une autre agence.
 */
class BookingSearchFilterTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    /** @var array<string, Booking> */
    private array $bookings = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();

        $villa = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Villa des Almadies']);
        $studio = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Studio meublé · Mermoz']);

        $ousmane = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => null,
            'first_name' => 'Ousmane', 'last_name' => 'Ba', 'phone' => '+221771234567',
        ]);
        // Le nom en capitales accentuées : `lower()` nu ne replie que l'ASCII sous `--locale=C`.
        $awa = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => null,
            'first_name' => 'Awa', 'last_name' => 'NDIAYÉ', 'phone' => '+221780000001',
        ]);

        $this->bookings['ousmane'] = $this->booking($studio, $ousmane, BookingKind::Application, 'BK-OUSM1234');
        $this->bookings['awa'] = $this->booking($villa, $awa, BookingKind::Offer, 'BK-AWAN5678');

        // Une autre agence, un autre Ousmane, sur un bien du même titre : jamais rendu.
        $autre = Agency::factory()->create();
        $ailleurs = Property::factory()->create(['agency_id' => $autre->id, 'title' => 'Villa des Almadies']);
        $autreOusmane = Customer::factory()->create([
            'agency_id' => $autre->id, 'user_id' => null,
            'first_name' => 'Ousmane', 'last_name' => 'Ba', 'phone' => '+221771234567',
        ]);
        $this->bookings['ailleurs'] = $this->booking($ailleurs, $autreOusmane, BookingKind::Application, 'BK-OUSM9999', $autre);
    }

    private function booking(Property $property, Customer $customer, BookingKind $kind, string $reference, ?Agency $agency = null): Booking
    {
        return Booking::factory()->create([
            'property_id' => $property->id,
            'agency_id' => ($agency ?? $this->agency)->id,
            'customer_id' => $customer->id,
            'created_by_id' => User::factory()->create()->id,
            'kind' => $kind,
            'reference_number' => $reference,
        ]);
    }

    /** @return list<int> */
    private function ids(string $search): array
    {
        Sanctum::actingAs($this->agent);

        return collect($this->getJson('/api/bookings?filter[search]='.rawurlencode($search))->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
    }

    public function test_ac1_a_customer_first_name_finds_their_application_and_nothing_from_another_agency(): void
    {
        $this->assertSame([$this->bookings['ousmane']->id], $this->ids('Ousmane'));
        $this->assertSame([$this->bookings['ousmane']->id], $this->ids('ousmane ba'));
    }

    public function test_the_property_title_finds_the_offers_on_it(): void
    {
        $this->assertSame([$this->bookings['awa']->id], $this->ids('almadies'));
        $this->assertSame([$this->bookings['awa']->id], $this->ids('VILLA ALMADIES'));
    }

    public function test_the_reference_is_found_whatever_its_case(): void
    {
        $this->assertSame([$this->bookings['awa']->id], $this->ids('bk-awan'));
    }

    public function test_the_case_of_an_accented_name_is_folded(): void
    {
        $this->assertSame([$this->bookings['awa']->id], $this->ids('ndiayé'));
    }

    public function test_the_phone_is_found_as_typed_with_spaces(): void
    {
        $this->assertSame([$this->bookings['ousmane']->id], $this->ids('77 123 45 67'));
        $this->assertSame([$this->bookings['awa']->id], $this->ids('+221 78 000'));
    }

    /** Une fiche ancienne garde un numéro que la normalisation n'a pas su réécrire (TCK-1754). */
    public function test_a_phone_stored_with_its_spaces_is_found_too(): void
    {
        DB::table('customers')->where('id', $this->bookings['awa']->customer_id)->update(['phone' => '78 000 00 01']);

        $this->assertSame([$this->bookings['awa']->id], $this->ids('780000'));
    }

    public function test_wildcards_are_literal_and_a_single_character_is_ignored(): void
    {
        $this->assertSame([], $this->ids('%%'));
        $this->assertSame([], $this->ids('a_a'));
        $this->assertSame(
            [$this->bookings['ousmane']->id, $this->bookings['awa']->id],
            $this->ids('o'),
        );
    }

    public function test_every_word_must_match(): void
    {
        $this->assertSame([], $this->ids('Ousmane Almadies'));
        $this->assertSame([$this->bookings['awa']->id], $this->ids('Awa Almadies'));
    }

    public function test_the_customer_only_finds_their_own_bookings(): void
    {
        $client = User::factory()->create();
        $this->bookings['ousmane']->customer->update(['user_id' => $client->id]);

        Sanctum::actingAs($client);
        $this->assertSame(
            [$this->bookings['ousmane']->id],
            collect($this->getJson('/api/bookings?filter[search]=Ba')->assertOk()->json('data'))->pluck('id')->all(),
        );
        $this->assertSame([], $this->getJson('/api/bookings?filter[search]=Almadies')->assertOk()->json('data'));
    }

    public function test_a_list_value_counts_as_no_search(): void
    {
        Sanctum::actingAs($this->agent);
        $this->getJson('/api/bookings?filter[search][]=Ousmane')->assertOk()->assertJsonCount(2, 'data');
    }
}
