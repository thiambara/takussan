<?php

namespace Tests\Feature\Calendar;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2886 — un événement `booking` de l'agenda dit qui séjourne (`customer_name`) et où est le bien
 * (`neighborhood`). Même cloisonnement que `visitor_name` (TCK-2585) : le nom ne sort qu'au
 * super-admin et au personnel de l'agence du bien ; le bailleur lit le quartier de son bien seul.
 */
class CalendarBookingEventTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $agent;

    private User $proprietaire;

    private Property $bien;

    private Booking $sejour;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->agent = $this->personnel($this->x);
        $this->proprietaire = $this->bailleur($this->x);
        $this->bien = $this->bienDe($this->x, $this->proprietaire);
        $this->adresse($this->bien, 'Ngor');
        $this->sejour = $this->sejourDe($this->bien, 'Awa', 'Diop');
    }

    private function adresse(Property $bien, string $quartier): void
    {
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'neighborhood' => $quartier,
            'city' => 'Dakar',
        ]);
    }

    private function sejourDe(Property $bien, string $prenom, string $nom): Booking
    {
        $fiche = $this->ficheClient($this->x, null, ['first_name' => $prenom, 'last_name' => $nom]);

        return Booking::factory()->create([
            'property_id' => $bien->id,
            'customer_id' => $fiche->id,
            'agency_id' => $this->x->id,
            'kind' => BookingKind::Stay,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDays(2)->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function evenements(User $user): array
    {
        $response = $this->actingAsApi($user)
            ->getJson('/api/calendar?types[]=booking&start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString())
            ->assertOk();
        $this->app['auth']->forgetGuards();

        return collect($response->json('data'))->where('type', 'booking')->values()->all();
    }

    /** @return array<string, mixed>|null */
    private function evenement(User $user): ?array
    {
        return collect($this->evenements($user))->firstWhere('key', "booking-{$this->sejour->id}");
    }

    /** AC1 — le personnel lit le client et le quartier. */
    public function test_ac1_le_personnel_lit_le_client_et_le_quartier(): void
    {
        $event = $this->evenement($this->agent);

        $this->assertNotNull($event);
        $this->assertSame('Awa Diop', $event['customer_name']);
        $this->assertSame('Ngor', $event['neighborhood']);
    }

    /** AC1 — le bailleur lit le quartier de son bien, pas le nom du client. */
    public function test_ac1_le_bailleur_lit_le_quartier_sans_le_client(): void
    {
        $event = $this->evenement($this->proprietaire);

        $this->assertNotNull($event);
        $this->assertSame('Ngor', $event['neighborhood']);
        $this->assertArrayNotHasKey('customer_name', $event);
    }

    /** AC3 — le nombre de requêtes ne dépend pas du nombre de séjours. */
    public function test_ac3_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_sejours(): void
    {
        $compte = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $events = $this->evenements($this->agent);
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();
            foreach ($events as $event) {
                $this->assertArrayHasKey('customer_name', $event);
            }

            return $n;
        };

        $un = $compte();

        foreach (['Almadies', 'Mermoz', 'Yoff'] as $i => $quartier) {
            $bien = $this->bienDe($this->x, $this->proprietaire);
            $this->adresse($bien, $quartier);
            $this->sejourDe($bien, 'Client', (string) $i);
        }

        $this->assertSame($un, $compte());
    }
}
