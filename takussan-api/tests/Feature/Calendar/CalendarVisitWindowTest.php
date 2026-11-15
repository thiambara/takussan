<?php

namespace Tests\Feature\Calendar;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2502 (revue) — une visite demandée par tranche, heure pas encore fixée, sort dans l'agenda de
 * la console ET dans le flux .ics comme un événement SUR LA JOURNÉE, la tranche dans le titre
 * (« heure à fixer »). Jamais un rendez-vous minuté au début de tranche (14:00 pour l'après-midi) :
 * le flux le pousserait dans Google ou Apple Agenda, qui y poseraient leurs alertes. Confirmée à une
 * heure, elle redevient un rendez-vous minuté.
 */
class CalendarVisitWindowTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $agent;

    private PropertyVisit $visit;

    private CarbonImmutable $jour;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->create(['preferred_language' => 'fr']);
        $this->materializeRoleProfile($this->agent, 'agent', $agency);

        $property = Property::factory()->create(['agency_id' => $agency->id, 'title' => 'Villa Ngor']);
        $this->jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->startOfDay();
        $this->visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $this->agent->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => VisitWindow::Afternoon->startOn($this->jour->format('Y-m-d'))->utc(),
            'preferred_window' => VisitWindow::Afternoon,
            'duration_minutes' => 30,
        ]);
    }

    /** @return array<string, mixed> */
    private function evenementConsole(): array
    {
        $response = $this->actingAsApi($this->agent)
            ->withHeader('Accept-Language', 'fr')
            ->getJson('/api/calendar?types[]=visit&start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString())
            ->assertOk();

        $event = collect($response->json('data'))->firstWhere('key', "visit-{$this->visit->id}");
        $this->assertNotNull($event, 'la visite doit sortir dans l\'agenda');

        return $event;
    }

    private function flux(): string
    {
        $url = $this->actingAsApi($this->agent)->apiPost('/api/me/calendar-feed')->assertCreated()->json('data.url');
        $this->app['auth']->forgetGuards();

        // RFC 5545 : les lignes longues sont pliées (CRLF + espace) — on les déplie avant de lire.
        return str_replace("\r\n ", '', $this->get((string) parse_url($url, PHP_URL_PATH))->assertOk()->getContent());
    }

    private function confirmerA(int $heure, int $minute): void
    {
        $this->actingAsApi($this->agent)
            ->postJson("/api/property-visits/{$this->visit->id}/confirm", [
                'scheduled_at' => $this->jour->setTime($heure, $minute)->utc()->toIso8601String(),
            ])->assertOk();
        $this->app['auth']->forgetGuards();
    }

    public function test_console_une_tranche_non_fixee_sort_sur_la_journee(): void
    {
        $event = $this->evenementConsole();

        $this->assertTrue($event['all_day']);
        $this->assertSame($this->jour->format('Y-m-d').' 00:00:00', $event['start']);
        $this->assertSame($this->jour->format('Y-m-d').' 00:00:00', $event['end']);
        $this->assertSame('afternoon', $event['preferred_window']);
        $this->assertSame("Villa Ngor — l'après-midi, heure à fixer", $event['title']);
        $this->assertStringNotContainsString('14:00', json_encode($event));
    }

    public function test_console_confirmee_elle_redevient_un_rendez_vous_minute(): void
    {
        $this->confirmerA(15, 30);
        $event = $this->evenementConsole();

        $this->assertFalse($event['all_day']);
        $this->assertNull($event['preferred_window']);
        $this->assertSame('Villa Ngor', $event['title']);
        $this->assertSame(
            $this->jour->format('Y-m-d').' 15:30',
            CarbonImmutable::parse($event['start'], 'UTC')->setTimezone(VisitSchedulingService::TIMEZONE)->format('Y-m-d H:i'),
        );
    }

    public function test_ics_une_tranche_non_fixee_sort_sur_la_journee(): void
    {
        $body = $this->flux();

        $this->assertStringContainsString('DTSTART;VALUE=DATE:'.$this->jour->format('Ymd'), $body);
        $this->assertStringContainsString('DTEND;VALUE=DATE:'.$this->jour->addDay()->format('Ymd'), $body);
        $this->assertStringContainsString("SUMMARY:Visite — Villa Ngor — l'après-midi\\, heure à fixer", $body);
        $this->assertStringNotContainsString('T140000Z', $body);
        // Le titre de la console n'est pas recopié : la tranche n'apparaît qu'une fois.
        $this->assertSame(1, substr_count($body, "l'après-midi"));
    }

    public function test_ics_confirmee_elle_redevient_un_rendez_vous_minute(): void
    {
        $this->confirmerA(15, 30);
        $body = $this->flux();

        $this->assertStringContainsString('DTSTART:'.$this->jour->setTime(15, 30)->utc()->format('Ymd\THis\Z'), $body);
        $this->assertStringNotContainsString('DTSTART;VALUE=DATE', $body);
        $this->assertStringContainsString('SUMMARY:Visite — Villa Ngor', $body);
        $this->assertStringNotContainsString('heure à fixer', $body);
    }

    /** Confirmée À l'heure exacte du début de tranche : l'heure ne change pas, la tranche tombe quand même. */
    public function test_confirmee_au_debut_de_tranche_la_tranche_tombe(): void
    {
        $this->confirmerA(14, 0);
        $event = $this->evenementConsole();

        $this->assertFalse($event['all_day']);
        $this->assertNull($event['preferred_window']);
        $this->assertNull($this->visit->fresh()->preferred_window);
    }
}
