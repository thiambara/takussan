<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2588 (ADR-0103) — la prochaine action d'une fiche : la plus proche d'une visite à venir et
 * d'une tâche ouverte à échéance, calculée sur la page et demandée par `fields[customers]`.
 */
class CustomerNextActionTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        // Lundi 9 novembre 2026, 09:00.
        $this->travelTo(Carbon::parse('2026-11-09 09:00:00'));

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
    }

    private function fiche(array $attributs = []): Customer
    {
        return $this->ficheClient($this->agence, null, $attributs + ['added_by_id' => $this->agent->id]);
    }

    private function visite(Customer $fiche, string $quand, VisitStatus $statut = VisitStatus::Confirmed, string $titre = 'Appartement Mermoz'): PropertyVisit
    {
        $bien = $this->bienDe($this->agence);
        $bien->forceFill(['title' => $titre])->saveQuietly();

        return PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'customer_id' => $fiche->id,
            'agent_id' => $this->agent->id,
            'status' => $statut,
            'scheduled_at' => Carbon::parse($quand),
        ]);
    }

    private function tache(Customer $fiche, ?string $echeance, ?User $auteur = null, string $titre = 'Relancer', TaskStatus $statut = TaskStatus::Open): Task
    {
        return Task::factory()->create([
            'taskable_type' => Customer::class,
            'taskable_id' => $fiche->id,
            'title' => $titre,
            'created_by_id' => ($auteur ?? $this->agent)->id,
            'assigned_to_id' => ($auteur ?? $this->agent)->id,
            'due_at' => $echeance !== null ? Carbon::parse($echeance) : null,
            'status' => $statut,
        ]);
    }

    /** @return array<string, mixed>|null */
    private function prochaineAction(Customer $fiche, ?User $lecteur = null): ?array
    {
        Sanctum::actingAs($lecteur ?? $this->agent);
        $ligne = collect($this->getJson('/api/customers?fields[customers]=id,first_name,next_action&per_page=100')
            ->assertOk()->json('data'))->firstWhere('id', $fiche->id);
        $this->assertNotNull($ligne);
        $this->assertArrayHasKey('next_action', $ligne);

        return $ligne['next_action'];
    }

    /** AC1 — visite confirmée jeudi 10:00, tâche « Relancer » vendredi : la visite. */
    public function test_ac1_la_visite_de_jeudi_passe_avant_la_tache_de_vendredi(): void
    {
        $mariama = $this->fiche(['first_name' => 'Mariama', 'last_name' => 'Fall']);
        $visite = $this->visite($mariama, '2026-11-12 10:00:00');
        $this->tache($mariama, '2026-11-13 09:00:00');

        $this->assertSame([
            'type' => 'visit',
            'id' => $visite->id,
            'at' => '2026-11-12T10:00:00+00:00',
            'label' => 'Appartement Mermoz',
            'overdue' => false,
        ], $this->prochaineAction($mariama));
    }

    /** Une tâche échue passe avant la visite à venir, et se dit en retard. */
    public function test_la_tache_echue_est_la_prochaine_action_et_se_dit_en_retard(): void
    {
        $fiche = $this->fiche();
        $this->visite($fiche, '2026-11-12 10:00:00');
        $tache = $this->tache($fiche, '2026-11-08 17:00:00', null, 'Envoyer le dossier');

        $this->assertSame([
            'type' => 'task',
            'id' => $tache->id,
            'at' => '2026-11-08T17:00:00+00:00',
            'label' => 'Envoyer le dossier',
            'overdue' => true,
            // TCK-2592 (décision 4) — l'auteur et assigné modifie sa tâche (CustomerNextActionManageTest).
            'manage' => true,
        ], $this->prochaineAction($fiche));
    }

    /** Ce qui n'est pas à faire n'est pas une action : visite passée ou annulée, tâche faite, tâche sans échéance. */
    public function test_seuls_les_faits_a_venir_ou_ouverts_comptent(): void
    {
        $fiche = $this->fiche();
        $this->visite($fiche, '2026-11-12 10:00:00', VisitStatus::Cancelled);
        $this->visite($fiche, '2026-11-05 10:00:00', VisitStatus::Scheduled);
        $this->tache($fiche, '2026-11-10 10:00:00', null, 'Faite', TaskStatus::Done);
        $this->tache($fiche, null, null, 'Sans échéance');

        $this->assertNull($this->prochaineAction($fiche));
    }

    /** La tâche d'un collègue compte, mais son titre ne sort pas pour qui ne la lit pas. */
    public function test_le_titre_d_une_tache_d_un_collegue_ne_sort_pas(): void
    {
        $fiche = $this->fiche();
        $collegue = $this->personnel($this->agence);
        $tache = $this->tache($fiche, '2026-11-10 10:00:00', $collegue, 'Secret du collègue');

        $action = $this->prochaineAction($fiche);
        $this->assertSame('task', $action['type']);
        $this->assertSame($tache->id, $action['id']);
        $this->assertNull($action['label']);

        $this->assertSame('Secret du collègue', $this->prochaineAction($fiche, $collegue)['label']);
    }

    /** Non demandée, elle n'est ni calculée ni rendue ; la fiche seule la sert aussi. */
    public function test_demandee_par_fields_et_servie_par_la_fiche(): void
    {
        $fiche = $this->fiche();
        $this->visite($fiche, '2026-11-12 10:00:00');

        Sanctum::actingAs($this->agent);
        $ligne = $this->getJson('/api/customers?fields[customers]=id,first_name')->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('next_action', $ligne);
        $this->assertArrayNotHasKey('follow_up', $ligne);
        $this->assertArrayNotHasKey('referent', $ligne);

        $this->getJson("/api/customers/{$fiche->id}?fields[customers]=id,next_action")
            ->assertOk()
            ->assertJsonPath('data.next_action.type', 'visit')
            ->assertJsonPath('data.next_action.at', '2026-11-12T10:00:00+00:00');

        // Un champ inconnu reste refusé.
        $this->getJson('/api/customers?fields[customers]=id,next_actions')->assertStatus(400);
    }

    /** `sort=next_action_at` : la plus proche d'abord, les fiches sans action en dernier, dans les deux sens. */
    public function test_tri_par_prochaine_action(): void
    {
        $tard = $this->fiche();
        $this->visite($tard, '2026-11-20 10:00:00');
        $sans = $this->fiche();
        $tot = $this->fiche();
        $this->tache($tot, '2026-11-10 08:00:00');

        Sanctum::actingAs($this->agent);
        $this->assertSame([$tot->id, $tard->id, $sans->id],
            collect($this->getJson('/api/customers?sort=next_action_at&fields[customers]=id')->assertOk()->json('data'))->pluck('id')->all());
        $this->assertSame([$tard->id, $tot->id, $sans->id],
            collect($this->getJson('/api/customers?sort=-next_action_at&fields[customers]=id')->assertOk()->json('data'))->pluck('id')->all());
    }

    /** `include=upcomingVisits` : trois au plus PAR fiche, les plus proches ; `include=visitsCount`. */
    public function test_visites_a_venir_trois_par_fiche_et_compte(): void
    {
        $a = $this->fiche();
        $b = $this->fiche();
        foreach ([$a, $b] as $fiche) {
            foreach (['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'] as $jour) {
                $this->visite($fiche, "{$jour} 10:00:00");
            }
            $this->visite($fiche, '2026-11-02 10:00:00', VisitStatus::Completed);
        }

        Sanctum::actingAs($this->agent);
        $data = collect($this->getJson('/api/customers?fields[customers]=id&include=upcomingVisits,visitsCount')
            ->assertOk()->json('data'))->keyBy('id');

        foreach ([$a, $b] as $fiche) {
            $visites = $data[$fiche->id]['upcoming_visits'];
            $this->assertCount(3, $visites);
            $this->assertSame(['2026-11-10T10:00:00+00:00', '2026-11-11T10:00:00+00:00', '2026-11-12T10:00:00+00:00'],
                array_column($visites, 'scheduled_at'));
            $this->assertSame(5, $data[$fiche->id]['visits_count']);
        }
    }
}
