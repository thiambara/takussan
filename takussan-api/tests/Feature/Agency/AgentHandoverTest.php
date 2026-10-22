<?php

namespace Tests\Feature\Agency;

use App\Listeners\Maintenance\SyncMaintenanceConversation;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\UserStatus;
use App\Models\Enums\VisitStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Agency\AgentHandoverService;
use App\Services\Messaging\ConversationAccess;
use App\Services\Model\MaintenanceRequestService;
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
        // TCK-589 (fusion) — un admin d'agence agit avec un second facteur : retirer, passer,
        // déclarer une absence sont des gestes d'équipe protégés (`ProtectedActions`).
        $user = User::factory()->create($role === 'agency_admin'
            ? ['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]
            : []);
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
                'tasks' => 3, 'visits' => 2, 'maintenance' => 1, 'responsible_properties' => 0, 'held_properties' => 0,
                'collaborations' => 2, 'customers' => 2,
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

    /**
     * P88.01 (TCK-1095) — un repreneur au compte bloqué ou supprimé n'est pas du personnel
     * (`PersonnelDeLAgence::estPersonnel()`), même avec un profil d'agent actif : la passation le
     * refuse sur son champ, et rien ne bouge. Il recevait la collaboration du sortant, marque
     * `is_primary` comprise, et ses tâches.
     */
    public function test_a_blocked_or_deleted_account_is_never_a_successor(): void
    {
        foreach ([UserStatus::Blocked, UserStatus::Deleted] as $status) {
            $candidate = $this->member('agent');
            $candidate->forceFill(['status' => $status])->save();

            $this->actingAsApi($this->admin)->apiPost($this->url('handover'), ['successor_id' => $candidate->id])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['successor_id' => __('team_handover.handover.successor_not_staff')]);

            $this->actingAsApi($this->admin)->apiPost($this->url('handover'), [
                'successors' => ['tasks' => $candidate->id], 'leave_unassigned' => true,
            ])->assertStatus(422)->assertJsonValidationErrors('successors.tasks');

            $this->assertSame(0, Task::query()->where('assigned_to_id', $candidate->id)->count());
            $this->assertSame(0, PropertyCollaborator::query()->where('user_id', $candidate->id)->count());
        }
        $this->assertSame(3, Task::query()->where('assigned_to_id', $this->leaver->id)->whereIn('id', $this->ids['tasks'])->count());
        $this->assertSame(2, PropertyCollaborator::query()->where('user_id', $this->leaver->id)->count());
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

    /**
     * TCK-1255 (P121.05, TCK-592) — l'éligibilité d'une intervention est celle de
     * `ProviderEligibility::isAssignable()` : un prestataire actif de l'agence la reçoit. La requête
     * HTTP n'admet que le personnel ; le service, appelé seul, juge par la règle de TCK-592.
     */
    public function test_the_maintenance_eligibility_is_the_rule_of_provider_eligibility(): void
    {
        $provider = User::factory()->create();
        ServiceProviderAgencyCollaboration::create([
            'service_provider_profile_id' => ServiceProviderProfile::factory()->create(['user_id' => $provider->id])->id,
            'agency_id' => $this->agency->id,
            'status' => CollaborationStatus::Active,
            'started_at' => now()->toDateString(),
        ]);

        $result = app(AgentHandoverService::class)->transfer($this->agency, $this->leaver, ['maintenance' => $provider], $this->admin);

        $this->assertSame($this->ids['maintenance'], $result['moved']['maintenance']);
        $this->assertArrayNotHasKey('maintenance', $result['unassigned']);
        $this->assertSame($provider->id, MaintenanceRequest::query()->find($this->ids['maintenance'][0])->assigned_to);

        // Ni personnel ni prestataire de l'agence : désassignée, comptée comme telle.
        $stranger = User::factory()->create();
        $result = app(AgentHandoverService::class)->transfer($this->agency, $provider, ['maintenance' => $stranger], $this->admin);
        $this->assertSame($this->ids['maintenance'], $result['unassigned']['maintenance']);
        $this->assertNull(MaintenanceRequest::query()->find($this->ids['maintenance'][0])->assigned_to);
    }

    /**
     * TCK-1329 (P121.01) — une intervention passe par `MaintenanceRequestService::assign()`, le
     * chemin du geste unitaire : le repreneur entre dans le fil et le partant en sort,
     * l'acceptation du partant tombe, et — décision du porteur — le devis du partant reste.
     */
    public function test_an_intervention_is_handed_over_through_the_assignment_path_and_keeps_its_quote(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $mr = MaintenanceRequest::factory()->create(['property_id' => $property->id, 'status' => MaintenanceStatus::Open]);
        app(MaintenanceRequestService::class)->assign($mr, $this->leaver, $this->admin);
        $mr->refresh()->forceFill([
            'accepted_at' => now(),
            'status' => MaintenanceStatus::QuoteSubmitted,
            'quote_amount' => 150000,
            'quote_submitted_at' => now(),
        ])->save();
        $conversation = SyncMaintenanceConversation::conversationFor($mr);
        $this->assertNotNull($conversation);

        $this->actingAsApi($this->admin)->apiPost($this->url('handover'), [
            'successor_id' => $this->successor->id,
        ])->assertOk()->assertJsonPath('data.moved.maintenance', 2);

        $mr->refresh();
        $this->assertSame($this->successor->id, $mr->assigned_to);
        $this->assertNull($mr->accepted_at);
        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->status);
        $this->assertSame('150000.00', (string) $mr->quote_amount);
        $this->assertNotNull($mr->quote_submitted_at);

        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allows($this->successor->fresh(), $conversation->fresh()));
        $this->assertFalse($access->allows($this->leaver->fresh(), $conversation->fresh()));
        $this->actingAsApi($this->successor)->apiGet("/api/conversations/{$conversation->id}/messages")->assertOk();
    }
}
