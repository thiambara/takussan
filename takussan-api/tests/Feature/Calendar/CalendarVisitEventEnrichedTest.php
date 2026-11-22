<?php

namespace Tests\Feature\Calendar;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2585 — un événement `visit` de l'agenda dit avec qui et où, au personnel de l'agence du bien
 * seulement ; le flux .ics de l'agent porte le lieu (`LOCATION`), jamais le nom du visiteur.
 */
class CalendarVisitEventEnrichedTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $agent;

    private User $proprietaire;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->agent = $this->personnel($this->x, attributes: ['preferred_language' => 'fr']);
        $this->proprietaire = $this->bailleur($this->x);
        $bien = $this->bienDe($this->x, $this->proprietaire);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'street' => 'Rue 10 x Rue 13',
            'neighborhood' => 'Point E',
            'city' => 'Dakar',
        ]);
        $fiche = $this->ficheClient($this->x, null, ['first_name' => 'Abdoulaye', 'last_name' => 'Cissé', 'phone' => '+221770000001']);
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'customer_id' => $fiche->id,
            'visitor_id' => null,
            'visitor_name' => 'Abdoulaye Cissé',
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(2)->setTime(10, 0),
            'duration_minutes' => 30,
        ]);
    }

    /** @return array<string, mixed>|null */
    private function evenement(User $user): ?array
    {
        $response = $this->actingAsApi($user)
            ->getJson('/api/calendar?types[]=visit&start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString())
            ->assertOk();
        $this->app['auth']->forgetGuards();

        return collect($response->json('data'))->firstWhere('key', "visit-{$this->visite->id}");
    }

    /** AC5 (R) — l'agent lit le visiteur et l'adresse. */
    public function test_ac5_l_agent_lit_le_visiteur_et_l_adresse(): void
    {
        $event = $this->evenement($this->agent);

        $this->assertNotNull($event);
        $this->assertSame('Abdoulaye Cissé', $event['visitor_name']);
        $this->assertSame('Rue 10 x Rue 13', $event['address_line']);
        $this->assertSame('Point E', $event['neighborhood']);
    }

    /** Le bailleur garde l'événement de son bien, sans ces clés. */
    public function test_le_bailleur_n_a_ni_le_visiteur_ni_l_adresse(): void
    {
        $event = $this->evenement($this->proprietaire);

        $this->assertNotNull($event);
        foreach (['visitor_name', 'address_line', 'neighborhood'] as $key) {
            $this->assertArrayNotHasKey($key, $event);
        }
    }

    /** AC5 (R) — le flux .ics de l'agent porte `LOCATION`, et pas le nom du visiteur. */
    public function test_ac5_le_flux_porte_le_lieu_pas_le_visiteur(): void
    {
        $url = $this->actingAsApi($this->agent)->apiPost('/api/me/calendar-feed')->assertCreated()->json('data.url');
        $this->app['auth']->forgetGuards();
        $ics = str_replace("\r\n ", '', $this->get((string) parse_url($url, PHP_URL_PATH))->assertOk()->getContent());

        $this->assertStringContainsString('LOCATION:Rue 10 x Rue 13\\, Point E', $ics);
        $this->assertStringNotContainsString('Abdoulaye', $ics);
        $this->assertStringNotContainsString('Cissé', $ics);
    }
}
