<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\PropertyVisit;
use App\Models\RoleDelegation;
use App\Models\Task;
use App\Models\User;
use App\Services\Crm\CustomerNextActionQuery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2592 (décision 4) — `next_action.manage` d'une tâche dit si le lecteur peut la modifier
 * (« Reporter » du pipeline écrit son échéance) : EXACTEMENT `TaskPolicy::update`, jugé pour la page.
 * Chaque cas compare la valeur servie à `Gate::allows('update', $tache)` ET à la valeur attendue :
 * une parité seule accepterait une règle fausse des deux côtés.
 */
class CustomerNextActionManageTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $collegue;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-09 09:00:00'));

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->collegue = $this->personnel($this->agence);
        $this->admin = $this->personnel($this->agence, 'agency_admin');
    }

    private function tacheSur(Customer $fiche, User $createur, ?User $assigne): Task
    {
        return Task::factory()->create([
            'taskable_type' => Customer::class,
            'taskable_id' => $fiche->id,
            'title' => 'Relancer',
            'created_by_id' => $createur->id,
            'assigned_to_id' => $assigne?->id,
            'due_at' => Carbon::parse('2026-11-10 09:00:00'),
        ]);
    }

    /** @return array<string, mixed> */
    private function prochaineAction(Customer $fiche, User $lecteur): array
    {
        Sanctum::actingAs($lecteur);
        $ligne = collect($this->getJson('/api/customers?fields[customers]=id,next_action&per_page=100')
            ->assertOk()->json('data'))->firstWhere('id', $fiche->id);
        $this->assertNotNull($ligne, 'la fiche est lisible par ce lecteur');
        $this->assertNotNull($ligne['next_action']);

        return $ligne['next_action'];
    }

    private function jugeComme(bool $attendu, Customer $fiche, Task $tache, User $lecteur): void
    {
        $action = $this->prochaineAction($fiche, $lecteur);
        $this->assertSame('task', $action['type']);
        $this->assertSame($tache->id, $action['id']);
        $this->assertSame($attendu, Gate::forUser($lecteur)->allows('update', $tache->fresh()), 'la politique elle-même');
        $this->assertSame($attendu, $action['manage'], 'manage suit TaskPolicy::update');
    }

    public function test_le_createur_membre_et_l_assigne_du_personnel_modifient(): void
    {
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->agent->id]);
        $this->jugeComme(true, $fiche, $this->tacheSur($fiche, $this->agent, $this->collegue), $this->agent);

        $autre = $this->ficheClient($this->agence, null, ['added_by_id' => $this->agent->id]);
        $this->jugeComme(true, $autre, $this->tacheSur($autre, $this->collegue, $this->agent), $this->agent);
    }

    public function test_la_tache_d_un_collegue_ne_se_modifie_pas(): void
    {
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->agent->id]);
        $this->jugeComme(false, $fiche, $this->tacheSur($fiche, $this->collegue, $this->collegue), $this->agent);
    }

    public function test_le_lecteur_d_equipe_lit_la_tache_sans_la_modifier(): void
    {
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->agent->id]);
        $tache = $this->tacheSur($fiche, $this->agent, $this->agent);
        $this->assertTrue(Gate::forUser($this->admin)->allows('view', $tache), 'l’admin lit la tâche (crm.view_all)');
        $this->jugeComme(false, $fiche, $tache, $this->admin);
    }

    public function test_le_remplacant_d_un_absent_modifie_pendant_l_absence_seulement(): void
    {
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->collegue->id]);
        $tache = $this->tacheSur($fiche, $this->collegue, $this->collegue);
        RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'replaces_user_id' => $this->collegue->id,
            'delegator_id' => $this->collegue->id,
            'agency_id' => $this->agence->id,
            'role' => RoleDelegation::ABSENCE_ROLE,
            'status' => RoleDelegationStatus::Active,
            'starts_at' => Carbon::parse('2026-11-08 00:00:00'),
            'ends_at' => Carbon::parse('2026-11-12 23:59:59'),
        ]);
        $this->jugeComme(true, $fiche, $tache, $this->agent);

        $this->travelTo(Carbon::parse('2026-11-13 09:00:00'));
        $this->jugeComme(false, $fiche, $tache, $this->agent);
    }

    public function test_le_bailleur_auteur_modifie_sa_tache_sur_sa_fiche(): void
    {
        $bailleur = $this->bailleur($this->agence);
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $bailleur->id]);
        $this->jugeComme(true, $fiche, $this->tacheSur($fiche, $bailleur, $bailleur), $bailleur);
    }

    /**
     * Vérification de c4a5d9937, r2 (mutant M2) — l'assigné ne modifie que s'il est du PERSONNEL de
     * l'agence de la fiche : un bailleur en est MEMBRE, lit sa fiche, et la tâche qu'un agent lui
     * assigne dessus ne se reporte pas (`TaskPolicy::isStaffOfParent`).
     */
    public function test_l_assigne_membre_sans_etre_du_personnel_ne_modifie_pas(): void
    {
        $bailleur = $this->bailleur($this->agence);
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $bailleur->id]);
        $this->jugeComme(false, $fiche, $this->tacheSur($fiche, $this->collegue, $bailleur), $bailleur);
    }

    /**
     * Vérification de c4a5d9937, r2 (mutant M3) — le créateur ne modifie que s'il est MEMBRE de
     * l'agence de la fiche (`TaskPolicy::isMemberOfParent`). Par HTTP, la condition ne se voit pas :
     * lire une fiche d'agence exige déjà d'en être membre (`Customer::scopeVisibleTo`). Elle se juge
     * donc sur la requête elle-même, pour l'agent qui a créé la tâche puis quitté l'agence — témoin :
     * la même tâche, avant son départ, se modifie.
     */
    public function test_le_createur_qui_a_quitte_l_agence_ne_modifie_plus(): void
    {
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->collegue->id]);
        $tache = $this->tacheSur($fiche, $this->agent, $this->collegue);
        $manage = fn (): mixed => (new CustomerNextActionQuery($this->agent->fresh()))->forPage([$fiche->id])[$fiche->id]['manage'] ?? null;

        $this->assertTrue(Gate::forUser($this->agent->fresh())->allows('update', $tache->fresh()), 'témoin : membre, il modifie');
        $this->assertTrue($manage(), 'témoin : membre, il modifie');

        AgentProfile::query()->where('user_id', $this->agent->id)->delete();

        $this->assertFalse(Gate::forUser($this->agent->fresh())->allows('update', $tache->fresh()), 'la politique elle-même');
        $this->assertFalse($manage(), 'manage suit TaskPolicy::update');
        // Et la fiche ne se lit plus : c'est pourquoi la page, seule, ne peut pas garder cette branche.
        Sanctum::actingAs($this->agent->fresh());
        $this->assertNotContains($fiche->id, $this->getJson('/api/customers?fields[customers]=id&per_page=100')->assertOk()->json('data.*.id'));
    }

    public function test_le_super_admin_modifie_tout(): void
    {
        $super = User::factory()->create();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $super->id]);
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->agent->id]);
        $this->jugeComme(true, $fiche, $this->tacheSur($fiche, $this->collegue, $this->collegue), $super->fresh());
    }

    public function test_une_fiche_hors_agence_le_createur_modifie(): void
    {
        $fiche = Customer::factory()->create(['agency_id' => null, 'added_by_id' => $this->agent->id]);
        $this->jugeComme(true, $fiche, $this->tacheSur($fiche, $this->agent, $this->agent), $this->agent);
    }

    public function test_une_visite_ne_porte_pas_manage(): void
    {
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->agent->id]);
        PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'customer_id' => $fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => Carbon::parse('2026-11-09 15:00:00'),
        ]);
        $action = $this->prochaineAction($fiche, $this->agent);
        $this->assertSame('visit', $action['type']);
        $this->assertArrayNotHasKey('manage', $action);
    }
}
