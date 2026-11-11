<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2585 — `GET /api/property-visits/slots` : la grille de la console, sur tout bien de l'agence
 * (publié ou non), occupée par les visites confirmées du bien et de l'agent, à l'heure de Dakar.
 */
class StaffVisitSlotsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private Property $nonPublie;

    private User $agent;

    private string $jour;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->nonPublie = $this->bienDe($this->x, public: false);
        $this->agent = $this->personnel($this->x);
        $this->jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(2)->format('Y-m-d');

        // L'agent est pris à 10:00 sur UN AUTRE bien de l'agence.
        PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->x)->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => CarbonImmutable::parse($this->creneau(2, 10)),
            'duration_minutes' => 30,
        ]);
    }

    /** @return array<string, bool> libellé → disponible */
    private function grille(User $user, array $query = []): array
    {
        Sanctum::actingAs($user);
        $data = $this->getJson('/api/property-visits/slots?'.http_build_query($query + ['property_id' => $this->nonPublie->id, 'date' => $this->jour]))
            ->assertOk()->json('data');

        $this->assertSame($this->jour, $data['date']);
        $this->assertSame(VisitSchedulingService::TIMEZONE, $data['timezone']);

        return collect($data['slots'])->pluck('available', 'label')->all();
    }

    /** AC4 (R) — un bien non publié rend des créneaux, sans 10:00 quand l'agent est pris ailleurs. */
    public function test_ac4_bien_non_publie_agent_pris_ailleurs(): void
    {
        $grille = $this->grille($this->agent);

        $this->assertSame('09:00', array_key_first($grille));
        $this->assertSame('18:30', array_key_last($grille));
        $this->assertFalse($grille['10:00']);
        $this->assertTrue($grille['10:30']);
        $this->assertTrue($grille['15:00']);
    }

    /** L'agent donné remplace l'appelant : un collègue libre l'est à 10:00. */
    public function test_l_agent_donne_remplace_l_appelant(): void
    {
        $collegue = $this->personnel($this->x);

        $this->assertTrue($this->grille($collegue)['10:00']);
        $this->assertFalse($this->grille($collegue, ['agent_id' => $this->agent->id])['10:00']);
        $this->assertTrue($this->grille($this->agent, ['agent_id' => $collegue->id])['10:00']);
    }

    /** Une visite confirmée DU BIEN occupe son créneau quel que soit l'agent. */
    public function test_une_visite_confirmee_du_bien_occupe_son_creneau(): void
    {
        PropertyVisit::factory()->create([
            'property_id' => $this->nonPublie->id,
            'agent_id' => null,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => CarbonImmutable::parse($this->creneau(2, 16)),
            'duration_minutes' => 30,
        ]);

        $this->assertFalse($this->grille($this->personnel($this->x))['16:00']);
    }

    /** Hors du personnel du bien — autre agence, bailleur, client, bien absent : le même 403. */
    public function test_hors_du_personnel_403(): void
    {
        foreach ([$this->personnel($this->agence()), User::query()->findOrFail($this->nonPublie->user_id), $this->client()] as $user) {
            Sanctum::actingAs($user);
            $this->getJson("/api/property-visits/slots?property_id={$this->nonPublie->id}&date={$this->jour}")->assertForbidden();
        }

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/property-visits/slots?property_id=999999&date={$this->jour}")->assertForbidden();
        $this->getJson("/api/property-visits/slots?date={$this->jour}")->assertForbidden();
    }

    public function test_date_et_agent_valides(): void
    {
        Sanctum::actingAs($this->agent);
        $base = "/api/property-visits/slots?property_id={$this->nonPublie->id}";

        $this->getJson($base)->assertStatus(422)->assertJsonValidationErrors('date');
        $this->getJson($base.'&date=2020-01-01')->assertStatus(422)->assertJsonValidationErrors('date');
        $this->getJson($base."&date={$this->jour}&agent_id=".$this->personnel($this->agence())->id)
            ->assertStatus(422)->assertJsonValidationErrors('agent_id');
    }
}
