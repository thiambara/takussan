<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2588 — AC4 : les attributs calculés coûtent un nombre de requêtes constant, quelle que soit la
 * taille de la page. Chaque fiche porte une visite à venir, une tâche de l'agent, une tâche échue
 * d'un collègue (dont le titre ne sort pas) et un référent : sans eux, le compte serait constant à
 * vide.
 */
class CustomerListQueryCountTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const LISTE = '/api/customers?per_page=20&fields[customers]=id,first_name,next_action,follow_up,referent,last_contacted_at&include=upcomingVisits,visitsCount';

    private Agency $agence;

    private User $agent;

    private User $collegue;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-09 09:00:00'));

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->collegue = $this->personnel($this->agence);
    }

    private function fiches(int $n): void
    {
        for ($i = 0; $i < $n; $i++) {
            $fiche = $this->ficheClient($this->agence, null, [
                'added_by_id' => $this->agent->id,
                'pipeline_stage' => CustomerPipelineStage::Negotiating,
            ]);
            PropertyVisit::factory()->create([
                'property_id' => $this->bienDe($this->agence)->id,
                'customer_id' => $fiche->id,
                'agent_id' => $this->agent->id,
                'status' => VisitStatus::Confirmed,
                'scheduled_at' => Carbon::parse('2026-11-12 10:00:00'),
            ]);
            Task::factory()->forCustomer($fiche)->create([
                'title' => 'Ma tâche', 'created_by_id' => $this->agent->id, 'assigned_to_id' => $this->agent->id,
                'due_at' => Carbon::parse('2026-11-13 10:00:00'),
            ]);
            Task::factory()->forCustomer($fiche)->create([
                'title' => 'Tâche du collègue', 'created_by_id' => $this->collegue->id, 'assigned_to_id' => $this->collegue->id,
                'due_at' => Carbon::parse('2026-11-08 10:00:00'),
            ]);
            UserCustomerRelationship::query()->create([
                'user_id' => $this->agent->id, 'customer_id' => $fiche->id, 'relationship_type' => 'agent_client',
                'status' => RelationshipStatus::Active, 'is_primary' => true,
            ]);
        }
    }

    private function requetes(int $attendues): int
    {
        Sanctum::actingAs($this->agent);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $data = $this->getJson(self::LISTE)->assertOk()->json('data');
        $n = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertCount($attendues, $data);
        foreach ($data as $ligne) {
            $this->assertSame('task', $ligne['next_action']['type']);
            $this->assertNull($ligne['next_action']['label'], 'le titre de la tâche du collègue ne sort pas');
            $this->assertTrue($ligne['next_action']['overdue']);
            $this->assertSame('overdue_task', $ligne['follow_up']['reason']);
            $this->assertSame($this->agent->id, $ligne['referent']['id']);
            $this->assertCount(1, $ligne['upcoming_visits']);
            // TCK-2589 — `manage` jugé pour chaque visite à venir, sans requête par ligne.
            $this->assertTrue($ligne['upcoming_visits'][0]['manage']);
        }

        return $n;
    }

    public function test_ac4_le_meme_nombre_de_requetes_pour_2_et_pour_20_fiches(): void
    {
        $this->fiches(2);
        // Une première lecture chauffe les caches de la requête suivante (capacités du rôle,
        // réglages de la plateforme) : elles ne dépendent pas de la page.
        $this->requetes(2);
        $deux = $this->requetes(2);

        $this->fiches(18);
        $this->assertSame($deux, $this->requetes(20));
    }
}
