<?php

namespace Tests\Feature\Calendar;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * Ce que `GET /api/calendar` dit de chaque événement, selon qui le lit (TCK-3017 : la classe du module ;
 * ex-CalendarBookingEventTest et ex-CalendarVisitEventEnrichedTest, versés ici sur un seul décor).
 *
 *  - TCK-2886 — un événement `visit` dit son rang (`visit_rank`) : sa place parmi les visites non
 *    annulées du même client sur le même bien, par date. Nul sans client.
 *  - TCK-2886 — un événement `booking` dit qui séjourne (`customer_name`) et où est le bien
 *    (`neighborhood`) ; le nom ne sort qu'au personnel de l'agence du bien, le bailleur lit le quartier seul.
 *  - TCK-2585 — un événement `visit` dit avec qui et où, au personnel de l'agence du bien seulement ; le
 *    flux .ics de l'agent porte le lieu (`LOCATION`), jamais le nom du visiteur.
 */
class CalendarVisitRankTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $agent;

    private User $proprietaire;

    private Property $bien;

    private Customer $fiche;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->agent = $this->personnel($this->x, attributes: ['preferred_language' => 'fr']);
        $this->proprietaire = $this->bailleur($this->x);
        $this->bien = $this->bienDe($this->x, $this->proprietaire);
        $this->fiche = $this->ficheClient($this->x);
    }

    private function visite(int $jours, VisitStatus $status = VisitStatus::Confirmed, ?Customer $fiche = null, ?Property $bien = null, bool $sansClient = false): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => ($bien ?? $this->bien)->id,
            'customer_id' => $sansClient ? null : ($fiche ?? $this->fiche)->id,
            'visitor_id' => null,
            'agent_id' => $this->agent->id,
            'status' => $status,
            'scheduled_at' => now()->addDays($jours)->setTime(10, 0),
            'duration_minutes' => 30,
        ]);
    }

    private function adresse(Property $bien, string $quartier, ?string $rue = null): void
    {
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'street' => $rue,
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

    /** La visite d'Abdoulaye Cissé, rue et quartier posés sur le bien. */
    private function visiteDAbdoulaye(): PropertyVisit
    {
        $this->adresse($this->bien, 'Point E', 'Rue 10 x Rue 13');
        $fiche = $this->ficheClient($this->x, null, ['first_name' => 'Abdoulaye', 'last_name' => 'Cissé', 'phone' => '+221770000001']);

        return PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'customer_id' => $fiche->id,
            'visitor_id' => null,
            'visitor_name' => 'Abdoulaye Cissé',
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(2)->setTime(10, 0),
            'duration_minutes' => 30,
        ]);
    }

    /**
     * @param  list<string>  $types
     * @return array<string, array<string, mixed>> les événements de ces types, par `key` (`visit-12`, `booking-3`)
     */
    private function evenements(array $types = ['visit'], ?User $lecteur = null): array
    {
        $filtre = implode('&', array_map(fn (string $t) => "types[]={$t}", $types));
        $response = $this->actingAsApi($lecteur ?? $this->agent)
            ->getJson("/api/calendar?{$filtre}&start_date=".now()->subDays(10)->toDateString().'&end_date='.now()->addDays(10)->toDateString())
            ->assertOk();
        $this->app['auth']->forgetGuards();

        return collect($response->json('data'))->whereIn('type', $types)->keyBy('key')->all();
    }

    // ── Rang de la visite (TCK-2886) ─────────────────────────────────────────

    /** AC2 — la première visite rend 1, la deuxième 2. */
    public function test_ac2_la_deuxieme_visite_rend_2(): void
    {
        $premiere = $this->visite(1);
        $deuxieme = $this->visite(3);

        $events = $this->evenements();

        $this->assertSame(1, $events["visit-{$premiere->id}"]['visit_rank']);
        $this->assertSame(2, $events["visit-{$deuxieme->id}"]['visit_rank']);
    }

    /** AC2 — une visite annulée ne compte pas, même passée et hors de la fenêtre servie. */
    public function test_ac2_une_visite_annulee_ne_compte_pas(): void
    {
        $this->visite(-30, VisitStatus::Cancelled);
        $this->visite(1, VisitStatus::Cancelled);
        $visite = $this->visite(3);

        $this->assertSame(1, $this->evenements()["visit-{$visite->id}"]['visit_rank']);
    }

    /** Une visite faite hors de la fenêtre compte : le rang se juge sur tout l'historique. */
    public function test_une_visite_faite_avant_la_fenetre_compte(): void
    {
        $this->visite(-30, VisitStatus::Completed);
        $visite = $this->visite(2);

        $this->assertSame(2, $this->evenements()["visit-{$visite->id}"]['visit_rank']);
    }

    /** Le rang se juge par client ET par bien. */
    public function test_le_rang_est_propre_au_client_et_au_bien(): void
    {
        $this->visite(1);
        $autreClient = $this->visite(2, fiche: $this->ficheClient($this->x));
        $autreBien = $this->visite(3, bien: $this->bienDe($this->x));

        $events = $this->evenements();

        $this->assertSame(1, $events["visit-{$autreClient->id}"]['visit_rank']);
        $this->assertSame(1, $events["visit-{$autreBien->id}"]['visit_rank']);
    }

    /** Sans client, pas de rang. */
    public function test_sans_client_le_rang_est_nul(): void
    {
        $visite = $this->visite(2, sansClient: true);

        $events = $this->evenements();

        $this->assertArrayHasKey('visit_rank', $events["visit-{$visite->id}"]);
        $this->assertNull($events["visit-{$visite->id}"]['visit_rank']);
    }

    // ── Séjour : client et quartier (TCK-2886) ───────────────────────────────

    /** AC1 — le personnel lit le client et le quartier. */
    public function test_ac1_le_personnel_lit_le_client_et_le_quartier(): void
    {
        $this->adresse($this->bien, 'Ngor');
        $sejour = $this->sejourDe($this->bien, 'Awa', 'Diop');

        $event = $this->evenements(['booking'])["booking-{$sejour->id}"] ?? null;

        $this->assertNotNull($event);
        $this->assertSame('Awa Diop', $event['customer_name']);
        $this->assertSame('Ngor', $event['neighborhood']);
    }

    /** AC1 — le bailleur lit le quartier de son bien, pas le nom du client. */
    public function test_ac1_le_bailleur_lit_le_quartier_sans_le_client(): void
    {
        $this->adresse($this->bien, 'Ngor');
        $sejour = $this->sejourDe($this->bien, 'Awa', 'Diop');

        $event = $this->evenements(['booking'], $this->proprietaire)["booking-{$sejour->id}"] ?? null;

        $this->assertNotNull($event);
        $this->assertSame('Ngor', $event['neighborhood']);
        $this->assertArrayNotHasKey('customer_name', $event);
    }

    // ── Visite : visiteur et adresse (TCK-2585) ──────────────────────────────

    /** AC5 (R) — l'agent lit le visiteur et l'adresse. */
    public function test_ac5_l_agent_lit_le_visiteur_et_l_adresse(): void
    {
        $visite = $this->visiteDAbdoulaye();

        $event = $this->evenements()["visit-{$visite->id}"] ?? null;

        $this->assertNotNull($event);
        $this->assertSame('Abdoulaye Cissé', $event['visitor_name']);
        $this->assertSame('Rue 10 x Rue 13', $event['address_line']);
        $this->assertSame('Point E', $event['neighborhood']);
    }

    /** Le bailleur garde l'événement de son bien, sans ces clés. */
    public function test_le_bailleur_n_a_ni_le_visiteur_ni_l_adresse(): void
    {
        $visite = $this->visiteDAbdoulaye();

        $event = $this->evenements(['visit'], $this->proprietaire)["visit-{$visite->id}"] ?? null;

        $this->assertNotNull($event);
        foreach (['visitor_name', 'address_line', 'neighborhood'] as $key) {
            $this->assertArrayNotHasKey($key, $event);
        }
    }

    /** AC5 (R) — le flux .ics de l'agent porte `LOCATION`, et pas le nom du visiteur. */
    public function test_ac5_le_flux_porte_le_lieu_pas_le_visiteur(): void
    {
        $this->visiteDAbdoulaye();

        $url = $this->actingAsApi($this->agent)->apiPost('/api/me/calendar-feed')->assertCreated()->json('data.url');
        $this->app['auth']->forgetGuards();
        $ics = str_replace("\r\n ", '', $this->get((string) parse_url($url, PHP_URL_PATH))->assertOk()->getContent());

        $this->assertStringContainsString('LOCATION:Rue 10 x Rue 13\\, Point E', $ics);
        $this->assertStringNotContainsString('Abdoulaye', $ics);
        $this->assertStringNotContainsString('Cissé', $ics);
    }

    // ── Coût ─────────────────────────────────────────────────────────────────

    /**
     * AC3 (TCK-2886, les deux) — le nombre de requêtes ne dépend ni du nombre de visites ni du nombre de
     * séjours. TCK-3017 : les deux tests N+1 fondus en un, sur un agenda qui sert les deux types.
     */
    public function test_ac3_le_nombre_de_requetes_ne_depend_ni_des_visites_ni_des_sejours(): void
    {
        $this->visite(1);
        $this->adresse($this->bien, 'Ngor');
        $this->sejourDe($this->bien, 'Awa', 'Diop');

        $compte = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $events = $this->evenements(['visit', 'booking']);
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();
            foreach ($events as $event) {
                if ($event['type'] === 'booking') {
                    $this->assertArrayHasKey('customer_name', $event);
                }
            }

            return $n;
        };

        $un = $compte();

        $this->visite(2);
        $this->visite(3, fiche: $this->ficheClient($this->x));
        $this->visite(4, bien: $this->bienDe($this->x));
        foreach (['Almadies', 'Mermoz', 'Yoff'] as $i => $quartier) {
            $bien = $this->bienDe($this->x, $this->proprietaire);
            $this->adresse($bien, $quartier);
            $this->sejourDe($bien, 'Client', (string) $i);
        }

        $this->assertSame($un, $compte());
    }
}
