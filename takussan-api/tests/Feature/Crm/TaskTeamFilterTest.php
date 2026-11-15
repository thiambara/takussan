<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2595 — `filter[team]=1` : les tâches du personnel actif de l'agence active, pour qui y tient
 * `crm.view_all` ; 403 sans elle ; jamais une autre agence.
 */
class TaskTeamFilterTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $admin;

    private User $agentA;

    private User $agentB;

    private Property $bien;

    /** @var array<string, Task> */
    private array $t = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->admin = $this->personnel($this->x, 'agency_admin');
        $this->agentA = $this->personnel($this->x, attributes: ['first_name' => 'Fatou', 'last_name' => 'Sow']);
        $this->agentB = $this->personnel($this->x);
        $this->bien = $this->bienDe($this->x);
        $fiche = $this->ficheClient($this->x);

        $tache = fn (User $assignee, array $a = []) => Task::factory()->create($a + [
            'taskable_type' => Property::class, 'taskable_id' => $this->bien->id,
            'assigned_to_id' => $assignee->id, 'created_by_id' => $assignee->id,
        ]);

        $this->t = [
            'a' => $tache($this->agentA),
            'a_fiche' => Task::factory()->forCustomer($fiche)->create(['assigned_to_id' => $this->agentA->id, 'created_by_id' => $this->admin->id]),
            'b' => $tache($this->agentB),
            // Ce qui n'est pas de l'équipe de X : tâche personnelle sans parent, bien d'une autre
            // agence, assigné qui n'est plus du personnel (bloqué), bailleur.
            'perso' => Task::factory()->create(['assigned_to_id' => $this->agentA->id, 'created_by_id' => $this->agentA->id]),
            'autre_agence' => $tache($this->agentA, ['taskable_id' => $this->bienDe($this->agence())->id]),
            'bloque' => $tache($this->personnel($this->x, attributes: ['status' => UserStatus::Blocked])),
            'bailleur' => $tache($this->bailleur($this->x)),
        ];
    }

    /** @return list<int> */
    private function ids(User $user, string $query = 'filter[team]=1'): array
    {
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/tasks?'.$query)->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
    }

    /** @return list<int> */
    private function of(string ...$keys): array
    {
        return collect($keys)->map(fn (string $k) => $this->t[$k]->id)->sort()->values()->all();
    }

    /** AC3 (R) — l'admin reçoit les tâches de ses deux agents, et rien d'autre. */
    public function test_ac3_l_admin_recoit_les_taches_de_ses_agents(): void
    {
        $this->assertSame($this->of('a', 'a_fiche', 'b'), $this->ids($this->admin));
        // Sans `filter[team]`, l'admin ne lit que les siennes (créées par lui).
        $this->assertSame($this->of('a_fiche'), $this->ids($this->admin, 'per_page=50'));
    }

    public function test_assigned_to_id_isole_un_agent_et_include_assigned_to(): void
    {
        Sanctum::actingAs($this->admin);
        $rows = $this->getJson("/api/tasks?filter[team]=1&filter[assigned_to_id]={$this->agentA->id}&include=assignedTo")->assertOk()->json('data');

        $this->assertSame($this->of('a', 'a_fiche'), collect($rows)->pluck('id')->sort()->values()->all());
        $this->assertSame(['id' => $this->agentA->id, 'name' => 'Fatou Sow'], $rows[0]['assigned_to']);

        $sans = $this->getJson('/api/tasks?filter[team]=1')->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('assigned_to', $sans);
    }

    /** AC3 (R) — sans `crm.view_all` : 403, avant toute ligne. */
    public function test_ac3_sans_crm_view_all_403(): void
    {
        $role = AgencyRole::factory()->for($this->x)->withCapabilities([Capability::PropertiesCreate])->create();

        foreach ([$this->personnel($this->x, agencyRole: $role), $this->bailleur($this->x), $this->client()] as $user) {
            Sanctum::actingAs($user);
            $this->getJson('/api/tasks?filter[team]=1')->assertForbidden();
        }
    }

    /** Jamais une autre agence : l'admin de Y ne lit rien de X. */
    public function test_l_admin_d_une_autre_agence_ne_lit_rien_de_x(): void
    {
        $this->assertSame([], $this->ids($this->personnel($this->agence(), 'agency_admin')));
    }

    /**
     * Décision de la session (2026-11-11) — une ligne qu'on liste s'ouvre : toute ligne de
     * `filter[team]=1` passe `show`.
     */
    public function test_parite_toute_ligne_de_l_equipe_s_ouvre(): void
    {
        $ids = $this->ids($this->admin);
        $this->assertNotEmpty($ids);

        foreach ($ids as $id) {
            $this->getJson("/api/tasks/{$id}")->assertOk()->assertJsonPath('data.id', $id);
        }
    }

    /** L'admin ouvre la tâche d'un collègue ; il ne la modifie, ne la coche, ni ne la supprime. */
    public function test_l_admin_lit_la_tache_d_un_collegue_sans_l_ecrire(): void
    {
        $task = $this->t['b'];
        Sanctum::actingAs($this->admin);

        $this->getJson("/api/tasks/{$task->id}")->assertOk()->assertJsonPath('data.title', $task->title);
        $this->patchJson("/api/tasks/{$task->id}", ['title' => 'Repris par l\'admin'])->assertForbidden();
        $this->putJson("/api/tasks/{$task->id}", ['status' => 'done'])->assertForbidden();
        $this->deleteJson("/api/tasks/{$task->id}")->assertForbidden();

        $fresh = $task->fresh();
        $this->assertSame($task->title, $fresh->title);
        $this->assertNotSame('done', $fresh->status->value);
        $this->assertNull($fresh->deleted_at);
    }

    /** Hors de la portée de l'équipe : autre agence, sans `crm.view_all`, tâche hors portée. */
    public function test_hors_de_la_portee_de_l_equipe_403(): void
    {
        $role = AgencyRole::factory()->for($this->x)->withCapabilities([Capability::PropertiesCreate])->create();
        foreach ([$this->personnel($this->agence(), 'agency_admin'), $this->personnel($this->x, agencyRole: $role)] as $user) {
            Sanctum::actingAs($user);
            $this->getJson("/api/tasks/{$this->t['b']->id}")->assertForbidden();
        }

        // L'admin de X ne lit pas, par l'équipe, ce que `filter[team]=1` ne liste pas.
        Sanctum::actingAs($this->admin);
        foreach (['perso', 'autre_agence', 'bloque', 'bailleur'] as $key) {
            $this->getJson("/api/tasks/{$this->t[$key]->id}")->assertForbidden();
        }
    }

    /** `filter[team]=0` est la liste habituelle. */
    public function test_team_faux_rend_mes_taches(): void
    {
        $this->assertSame($this->ids($this->agentB, 'per_page=50'), $this->ids($this->agentB, 'filter[team]=0'));
    }
}
