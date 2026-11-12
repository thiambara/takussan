<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\RoleDelegation;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2589 (contre-vérification de verif-commercial, `reserve_titres_de_taches`) — une entrée de
 * tâche du fil de la fiche (`…/timeline`) et du journal (`…/activity`) suit `TaskPolicy::view` :
 * une tâche que le lecteur ne peut pas ouvrir (`GET /api/tasks/{id}` → 403) est omise, ni entrée
 * ni titre. Le bailleur auteur et l'agent auteur sans `crm.view_all` lisaient le titre de la tâche
 * que l'admin s'était donnée sur leur fiche.
 */
class CustomerTimelineTachesLisiblesTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
    }

    private function agentSansVueEquipe(): User
    {
        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();

        return $this->personnel($this->agence, 'agent', $role);
    }

    /** La fiche de $auteur, et la tâche que l'admin s'y est donnée. */
    private function ficheAvecTacheDeLAdmin(User $auteur): array
    {
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $auteur->id]);
        Activity::query()->delete();
        $tache = Task::factory()->create([
            'taskable_type' => Customer::class,
            'taskable_id' => $fiche->id,
            'created_by_id' => $this->admin->id,
            'assigned_to_id' => $this->admin->id,
            'title' => 'Vérifier la solvabilité',
        ]);
        $tache->update(['status' => 'done']);

        return [$fiche, $tache];
    }

    /** @return array{fil: list<array<string, mixed>>, journal: list<array<string, mixed>>} */
    private function lu(User $lecteur, Customer $fiche): array
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($lecteur);

        return [
            'fil' => $this->getJson("/api/customers/{$fiche->id}/timeline?per_page=50")->assertOk()->json('data'),
            'journal' => $this->getJson("/api/customers/{$fiche->id}/activity?per_page=50")->assertOk()->json('data'),
        ];
    }

    /**
     * Les entrées de tâche : `type` au fil, `subject` au journal.
     *
     * @param  list<array<string, mixed>>  $entrees
     */
    private function tachesDu(array $entrees): array
    {
        return array_values(array_filter($entrees, fn (array $e) => ($e['type'] ?? $e['subject']) === 'task'));
    }

    public function test_l_admin_lit_sa_tache_au_fil_et_au_journal(): void
    {
        [$fiche] = $this->ficheAvecTacheDeLAdmin($this->agentSansVueEquipe());

        $lu = $this->lu($this->admin, $fiche);

        $this->assertCount(2, $this->tachesDu($lu['fil']), 'créée puis faite');
        $this->assertSame('Vérifier la solvabilité', $this->tachesDu($lu['fil'])[0]['task']['title']);
        $this->assertCount(2, $this->tachesDu($lu['journal']));
    }

    public function test_l_agent_auteur_sans_vue_d_equipe_ne_lit_pas_la_tache_de_l_admin(): void
    {
        $agent = $this->agentSansVueEquipe();
        [$fiche, $tache] = $this->ficheAvecTacheDeLAdmin($agent);

        $lu = $this->lu($agent, $fiche);

        $this->getJson("/api/tasks/{$tache->id}")->assertForbidden();
        $this->assertSame([], $this->tachesDu($lu['fil']));
        $this->assertSame([], $this->tachesDu($lu['journal']));
        $this->assertStringNotContainsString('solvabilité', json_encode($lu, JSON_UNESCAPED_UNICODE));
    }

    public function test_le_bailleur_auteur_ne_lit_pas_la_tache_de_l_admin(): void
    {
        $bailleur = $this->bailleur($this->agence);
        [$fiche, $tache] = $this->ficheAvecTacheDeLAdmin($bailleur);

        $lu = $this->lu($bailleur, $fiche);

        $this->getJson("/api/tasks/{$tache->id}")->assertForbidden();
        $this->assertSame([], $this->tachesDu($lu['fil']));
        $this->assertSame([], $this->tachesDu($lu['journal']));
        $this->assertStringNotContainsString('solvabilité', json_encode($lu, JSON_UNESCAPED_UNICODE));
    }

    /** La règle omet ce qu'on ne peut pas ouvrir, pas les tâches : la sienne, et celle qu'on lui confie, restent. */
    public function test_l_agent_lit_la_tache_qu_il_a_creee_et_celle_qu_on_lui_a_confiee(): void
    {
        $agent = $this->agentSansVueEquipe();
        [$fiche] = $this->ficheAvecTacheDeLAdmin($agent);
        $sienne = Task::factory()->create(['taskable_type' => Customer::class, 'taskable_id' => $fiche->id, 'created_by_id' => $agent->id, 'assigned_to_id' => $this->admin->id, 'title' => 'Rappeler']);
        $confiee = Task::factory()->create(['taskable_type' => Customer::class, 'taskable_id' => $fiche->id, 'created_by_id' => $this->admin->id, 'assigned_to_id' => $agent->id, 'title' => 'Envoyer les biens']);

        $lu = $this->lu($agent, $fiche);

        $this->assertEqualsCanonicalizing([$sienne->id, $confiee->id], array_column(array_column($this->tachesDu($lu['fil']), 'task'), 'id'));
        $this->assertCount(2, $this->tachesDu($lu['journal']));
        $this->assertEqualsCanonicalizing([$sienne->id, $confiee->id], array_column($this->tachesDu($lu['journal']), 'subject_id'));
    }

    /** Le lecteur d'équipe (`crm.view_all`) lit la tâche d'un collègue, comme `GET /api/tasks/{id}`. */
    public function test_le_lecteur_d_equipe_lit_la_tache_d_un_collegue(): void
    {
        $agent = $this->agentSansVueEquipe();
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $agent->id]);
        $tache = Task::factory()->create(['taskable_type' => Customer::class, 'taskable_id' => $fiche->id, 'created_by_id' => $agent->id, 'assigned_to_id' => $agent->id]);

        $lu = $this->lu($this->admin, $fiche);

        $this->getJson("/api/tasks/{$tache->id}")->assertOk();
        $this->assertSame([$tache->id], array_column(array_column($this->tachesDu($lu['fil']), 'task'), 'id'));
    }

    /**
     * La clause SQL du fil et la policy disent la même chose, branche par branche : créateur,
     * assigné, suppléant d'un absent, lecteur d'équipe, assigné et créateur suspendus, bailleur,
     * tâche supprimée, délégué ACTIF mais hors vigueur (contre-vérification de 5c81b390a : sans profil
     * d'agence actif, sa délégation ne le fait pas personnel — `enVigueur()`, pas `active()`). Le compte de chaque lecteur est épinglé, pour qu'un
     * accord vide ne passe pas pour un accord.
     */
    public function test_la_clause_du_fil_rend_exactement_ce_que_la_policy_ouvre(): void
    {
        $agent = $this->agentSansVueEquipe();
        $absent = $this->agentSansVueEquipe();
        $suppleant = $this->agentSansVueEquipe();
        $suspendu = $this->agentSansVueEquipe();
        $bailleur = $this->bailleur($this->agence);
        // Délégation `agent` active dans l'agence, mais aucun profil d'agence actif : hors vigueur.
        $delegue = User::factory()->create();
        RoleDelegation::factory()->create([
            'user_id' => $delegue->id, 'delegator_id' => $this->admin->id, 'agency_id' => $this->agence->id,
            'role' => 'agent', 'status' => RoleDelegationStatus::Active, 'starts_at' => now()->subDay(), 'ends_at' => now()->addWeek(),
        ]);
        RoleDelegation::factory()->create([
            'user_id' => $suppleant->id, 'replaces_user_id' => $absent->id, 'delegator_id' => $absent->id,
            'agency_id' => $this->agence->id, 'role' => RoleDelegation::ABSENCE_ROLE, 'status' => RoleDelegationStatus::Active,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $bailleur->id]);
        $tache = fn (User $createur, ?User $assigne) => Task::factory()->create([
            'taskable_type' => Customer::class, 'taskable_id' => $fiche->id,
            'created_by_id' => $createur->id, 'assigned_to_id' => $assigne?->id,
        ]);
        $tache($this->admin, $this->admin);
        $tache($this->admin, $agent);
        $tache($agent, $this->admin);
        $tache($this->admin, $absent);
        $tache($bailleur, null);
        $tache($this->admin, $suspendu);
        $tache($suspendu, null);
        $tache($agent, $suspendu);
        $deDelegue = $tache($agent, $delegue);
        $tache($bailleur, $agent)->delete();
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended]);

        $attendus = [];
        $rendus = [];
        foreach (['admin' => $this->admin, 'agent' => $agent, 'absent' => $absent, 'suppleant' => $suppleant, 'suspendu' => $suspendu, 'bailleur' => $bailleur, 'delegue' => $delegue] as $nom => $lecteur) {
            $lecteur = $lecteur->fresh();
            $this->app['auth']->forgetGuards();
            Sanctum::actingAs($lecteur);
            $toutes = Task::withTrashed()->where('taskable_id', $fiche->id)->orderBy('id')->get();
            $attendus[$nom] = $toutes->filter(fn (Task $t) => $lecteur->can('view', $t))->pluck('id')->values()->all();
            $rendus[$nom] = Task::withTrashed()->where('taskable_id', $fiche->id)
                ->lisiblesSurUnParentPar($lecteur, $this->agence->id)->orderBy('id')->pluck('id')->all();
        }

        $this->assertSame($attendus, $rendus);
        $this->assertSame(
            ['admin' => 6, 'agent' => 5, 'absent' => 1, 'suppleant' => 1, 'suspendu' => 0, 'bailleur' => 2, 'delegue' => 0],
            array_map('count', $rendus),
        );

        // `filter[team]=1` lit la même borne d'assigné : la tâche du délégué hors vigueur n'y est pas.
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->admin->fresh());
        $equipe = collect($this->getJson('/api/tasks?filter[team]=1&per_page=100')->assertOk()->json('data'))->pluck('id');
        $this->assertNotContains($deDelegue->id, $equipe);
        $this->assertNotEmpty($equipe);
    }
}
