<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-591 AC12 (hors catégories de biens, qui attendent TCK-504) — la passation déplace tout au
 * repreneur en une transaction, dédoublonne les collaborations, journalise une entrée par catégorie,
 * et une erreur à mi-parcours ne déplace rien.
 */
class AgentHandoverTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $leaver;

    private User $successor;

    /** @var array<string, list<int>> */
    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->member('agency_admin');
        $this->leaver = $this->member('agent');
        $this->successor = $this->member('agent');

        $customer = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $shared = Property::factory()->create(['agency_id' => $this->agency->id]);

        for ($i = 0; $i < 3; $i++) {
            $this->ids['tasks'][] = Task::factory()->forCustomer($customer)->create([
                'created_by_id' => $this->admin->id,
                'assigned_to_id' => $this->leaver->id,
                'status' => TaskStatus::Open,
            ])->id;
        }
        // Terminée : de l'histoire, pas du portefeuille.
        Task::factory()->forCustomer($customer)->create([
            'created_by_id' => $this->admin->id, 'assigned_to_id' => $this->leaver->id, 'status' => TaskStatus::Done,
        ]);

        for ($i = 0; $i < 2; $i++) {
            $this->ids['visits'][] = PropertyVisit::factory()->create([
                'property_id' => $property->id,
                'visitor_id' => User::factory()->create()->id,
                'agent_id' => $this->leaver->id,
                'status' => VisitStatus::Scheduled,
                'scheduled_at' => now()->addDays($i + 1),
            ])->id;
        }

        $this->ids['maintenance'][] = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'assigned_to' => $this->leaver->id,
            'status' => MaintenanceStatus::Assigned,
        ])->id;

        $this->ids['collaborations'][] = PropertyCollaborator::query()->create([
            'property_id' => $property->id, 'user_id' => $this->leaver->id, 'role' => CollaboratorRole::Agent,
        ])->id;
        $this->ids['collaborations'][] = PropertyCollaborator::query()->create([
            'property_id' => $shared->id, 'user_id' => $this->leaver->id, 'role' => CollaboratorRole::Agent,
        ])->id;
        // Le repreneur collabore déjà au second bien.
        PropertyCollaborator::query()->create([
            'property_id' => $shared->id, 'user_id' => $this->successor->id, 'role' => CollaboratorRole::Viewer,
        ]);

        foreach (Customer::factory()->count(2)->create(['agency_id' => $this->agency->id]) as $client) {
            $this->ids['customers'][] = UserCustomerRelationship::query()->create([
                'user_id' => $this->leaver->id,
                'customer_id' => $client->id,
                'relationship_type' => RelationshipType::AgentClient,
                'status' => RelationshipStatus::Active,
                'is_primary' => true,
            ])->id;
        }
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    private function url(string $suffix): string
    {
        return "/api/agencies/{$this->agency->id}/members/{$this->leaver->id}/{$suffix}";
    }

    public function test_the_portfolio_is_counted_by_category(): void
    {
        $this->actingAsApi($this->admin)->apiGet($this->url('portfolio'))
            ->assertOk()
            ->assertJsonPath('data.portfolio', [
                'tasks' => 3, 'visits' => 2, 'maintenance' => 1, 'collaborations' => 2, 'customers' => 2, 'held_properties' => 0,
            ]);

        $this->actingAsApi($this->leaver)->apiGet($this->url('portfolio'))->assertForbidden();
    }

    public function test_everything_goes_to_the_successor_then_the_leaver_is_removed(): void
    {
        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), [
            'successor_id' => $this->successor->id,
            'remove_after' => true,
        ])->assertOk()
            ->assertJsonPath('data.removed', true)
            ->assertJsonPath('data.moved.tasks', 3)
            ->assertJsonPath('data.portfolio.tasks', 0);

        $this->assertSame(3, Task::query()->whereIn('id', $this->ids['tasks'])->where('assigned_to_id', $this->successor->id)->count());
        $this->assertSame(2, PropertyVisit::query()->whereIn('id', $this->ids['visits'])->where('agent_id', $this->successor->id)->count());
        $this->assertSame($this->successor->id, MaintenanceRequest::query()->find($this->ids['maintenance'][0])->assigned_to);
        $this->assertSame(0, PropertyCollaborator::query()->where('user_id', $this->leaver->id)->count());
        $this->assertSame(2, PropertyCollaborator::query()->where('user_id', $this->successor->id)->count());
        $this->assertSame(2, UserCustomerRelationship::query()->where('user_id', $this->successor->id)->where('is_primary', true)->count());

        $journal = Activity::query()->where('log_name', 'AgentHandover')->get();
        $this->assertEqualsCanonicalizing(
            ['tasks', 'visits', 'maintenance', 'collaborations', 'customers'],
            $journal->pluck('event')->all(),
        );
        $this->assertEqualsCanonicalizing($this->ids['tasks'], $journal->firstWhere('event', 'tasks')->properties['ids']);
        $this->assertSoftDeleted('agent_profiles', ['user_id' => $this->leaver->id]);
    }

    public function test_one_successor_per_category_and_the_rest_left_in_place(): void
    {
        $other = $this->member('agent');

        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), [
            'successors' => ['tasks' => $other->id, 'customers' => $this->successor->id],
            'leave_unassigned' => true,
        ])->assertOk()->assertJsonPath('data.removed', false);

        $this->assertSame(3, Task::query()->where('assigned_to_id', $other->id)->count());
        $this->assertSame(2, UserCustomerRelationship::query()->where('user_id', $this->successor->id)->count());
        $this->assertSame(2, PropertyVisit::query()->where('agent_id', $this->leaver->id)->count());
    }

    public function test_a_landlord_or_the_leaver_is_never_a_successor(): void
    {
        foreach ([$this->member('owner'), $this->leaver] as $candidate) {
            $this->actingAsApi($this->admin)->apiPost($this->url('handover'), ['successor_id' => $candidate->id])
                ->assertStatus(422)
                ->assertJsonValidationErrors('successor_id');
        }
        $this->assertSame(3, Task::query()->where('assigned_to_id', $this->leaver->id)->whereIn('id', $this->ids['tasks'])->count());
    }

    public function test_a_failure_halfway_moves_nothing(): void
    {
        DB::listen(function ($query) {
            if (str_starts_with($query->sql, 'update "property_visits"')) {
                throw new \RuntimeException('panne injectée');
            }
        });

        $this->withoutExceptionHandling();
        try {
            $this->actingAsApi($this->admin)->apiPost($this->url('handover'), ['successor_id' => $this->successor->id]);
            $this->fail('La panne injectée aurait dû remonter.');
        } catch (\RuntimeException $e) {
            $this->assertSame('panne injectée', $e->getMessage());
        }

        $this->assertSame(3, Task::query()->whereIn('id', $this->ids['tasks'])->where('assigned_to_id', $this->leaver->id)->count());
        $this->assertSame(0, Activity::query()->where('log_name', 'AgentHandover')->count());
    }

    public function test_a_remove_after_refused_rolls_the_handover_back(): void
    {
        $this->agency->update(['primary_admin_id' => $this->leaver->id]);

        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), [
            'successor_id' => $this->successor->id,
            'remove_after' => true,
        ])->assertStatus(422);

        $this->assertSame(3, Task::query()->whereIn('id', $this->ids['tasks'])->where('assigned_to_id', $this->leaver->id)->count());
    }

    /**
     * verif-591 M1 (décision de la session) — après passation et retrait, le partant ne garde ni
     * les fiches qu'il a ajoutées ni les tâches qu'il a créées : la clause « auteur » exige d'être
     * encore membre de l'agence. Il ne reprend pas la tâche transmise, ne la supprime pas.
     */
    public function test_after_handover_and_removal_the_leaver_keeps_nothing_he_authored(): void
    {
        $cid = $this->actingAsApi($this->leaver)->apiPost('/api/customers', [
            'first_name' => 'Awa', 'last_name' => 'Diop', 'phone' => '77 999 88 77', 'id_number' => 'SN123',
        ])->assertCreated()->json('data.id');
        $tid = $this->actingAsApi($this->leaver)->apiPost('/api/tasks', [
            'title' => 'Relance', 'taskable_type' => Customer::class, 'taskable_id' => $cid, 'assigned_to_id' => $this->leaver->id,
        ])->assertCreated()->json('data.id');

        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), [
            'successor_id' => $this->successor->id, 'remove_after' => true,
        ])->assertOk()->assertJsonPath('data.removed', true);
        $this->assertSame($this->successor->id, Task::query()->find($tid)->assigned_to_id);

        $leaver = $this->leaver->fresh();
        $this->assertSame([], $this->actingAsApi($leaver)->apiGet('/api/customers')->assertOk()->json('data'));
        $this->actingAsApi($leaver)->apiGet("/api/customers/{$cid}")->assertForbidden();
        $this->actingAsApi($leaver)->apiPut("/api/customers/{$cid}", ['first_name' => 'Modifiée'])->assertForbidden();
        $this->actingAsApi($leaver)->apiPatch("/api/customers/{$cid}/pipeline-stage", ['pipeline_stage' => 'lost', 'reason' => 'x'])->assertForbidden();
        $this->assertSame('Awa', Customer::query()->find($cid)->first_name);

        $this->assertSame([], $this->actingAsApi($leaver)->apiGet('/api/tasks')->assertOk()->json('data'));
        $this->actingAsApi($leaver)->apiPut("/api/tasks/{$tid}", ['assigned_to_id' => $leaver->id])->assertForbidden();
        $this->actingAsApi($leaver)->apiDelete("/api/tasks/{$tid}")->assertForbidden();
        $this->assertSame($this->successor->id, Task::query()->find($tid)->assigned_to_id);
    }

    /**
     * verif-591 M2 — la passation ne s'applique qu'à un membre de l'équipe : celle d'un bailleur
     * est refusée (422 `agent_handover.member_not_staff`), portefeuille compris, et sa co-propriété reste à lui.
     * Pour un agent, seules ses collaborations d'AGENT passent : une co-propriété ne se passe pas.
     */
    public function test_only_a_team_member_is_handed_over_and_only_his_agent_collaborations(): void
    {
        $landlord = $this->member('owner');
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $coOwned = PropertyCollaborator::query()->create([
            'property_id' => $property->id, 'user_id' => $landlord->id, 'role' => CollaboratorRole::CoOwner,
            'invited_at' => now(), 'accepted_at' => now(),
        ]);
        $base = "/api/agencies/{$this->agency->id}/members/{$landlord->id}";

        $this->actingAsApi($this->admin)->apiGet("{$base}/portfolio")
            ->assertStatus(422)->assertJsonPath('code', 'agent_handover.member_not_staff');
        $this->actingAsApi($this->admin)->apiPost("{$base}/handover", ['successor_id' => $this->successor->id])
            ->assertStatus(422)->assertJsonPath('code', 'agent_handover.member_not_staff');
        $this->assertSame($landlord->id, $coOwned->fresh()->user_id);

        $leaversCoOwnership = PropertyCollaborator::query()->create([
            'property_id' => $property->id, 'user_id' => $this->leaver->id, 'role' => CollaboratorRole::CoOwner,
        ]);
        $this->actingAsApi($this->admin)->apiGet($this->url('portfolio'))->assertJsonPath('data.portfolio.collaborations', 2);
        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), ['successor_id' => $this->successor->id])
            ->assertOk()->assertJsonPath('data.moved.collaborations', 2);
        $this->assertSame($this->leaver->id, $leaversCoOwnership->fresh()->user_id);
    }
}
