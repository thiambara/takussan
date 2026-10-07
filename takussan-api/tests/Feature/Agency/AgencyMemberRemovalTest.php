<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\CalendarFeed;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-591 AC13, AC21, AC23 — un seul chemin de retrait : membre du personnel seulement, portefeuille
 * non vide refusé sans passation ni `leave_unassigned`, journalisé, autorisé par `team.remove`,
 * flux iCalendar et affectations éteints.
 */
class AgencyMemberRemovalTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->member('agency_admin');
        // Un second admin : la garde du dernier admin ne doit pas répondre à la place des autres.
        $this->member('agency_admin');
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    private function remove(User $as, User $member, array $body = [])
    {
        return $this->actingAsApi($as)->deleteJson("/api/agencies/{$this->agency->id}/members/{$member->id}", $body);
    }

    private function openTaskFor(User $agent): Task
    {
        return Task::factory()
            ->forCustomer(Customer::factory()->create(['agency_id' => $this->agency->id]))
            ->create(['created_by_id' => $this->admin->id, 'assigned_to_id' => $agent->id]);
    }

    /** AC13 */
    public function test_a_non_empty_portfolio_needs_a_handover_or_an_assumed_leave(): void
    {
        $agent = $this->member('agent');
        $this->openTaskFor($agent);
        $path = (string) parse_url(
            $this->actingAsApi($agent)->apiPost('/api/me/calendar-feed')->assertCreated()->json('data.url'),
            PHP_URL_PATH,
        );

        $this->remove($this->admin, $agent)
            ->assertStatus(422)
            ->assertJsonPath('code', 'portfolio_not_empty')
            ->assertJsonPath('portfolio.tasks', 1);
        $this->assertNotSoftDeleted('agent_profiles', ['user_id' => $agent->id]);

        $this->remove($this->admin, $agent, ['leave_unassigned' => true])->assertOk();

        $this->assertSoftDeleted('agent_profiles', ['user_id' => $agent->id]);
        $log = Activity::query()->where('log_name', 'Membership')->sole();
        $this->assertSame('agent_removed', $log->event);
        $this->assertSame($this->admin->id, $log->causer_id);
        $this->assertTrue($log->properties['leave_unassigned']);
        $this->assertSame(['agent'], $log->properties['removed_profiles']);

        // Révoqué à la source, pas seulement refusé à la lecture (ADR-0034).
        $this->assertNotNull(CalendarFeed::query()->where('user_id', $agent->id)->sole()->revoked_at);
        $this->app['auth']->forgetGuards();
        $this->get($path)->assertNotFound();
    }

    /** AC13 — la capacité `team.remove`, et non le type de profil, décide. */
    public function test_team_remove_decides_not_the_profile_type(): void
    {
        $remover = $this->member('agent');
        $withRemove = AgencyRole::factory()->withCapabilities([Capability::TeamRemove])->create(['agency_id' => $this->agency->id]);
        AgentProfile::query()->where('user_id', $remover->id)->update(['agency_role_id' => $withRemove->id]);

        $strippedAdmin = $this->member('agency_admin');
        $withoutRemove = AgencyRole::factory()->withCapabilities([Capability::AgencyUpdate])->create(['agency_id' => $this->agency->id]);
        AgencyAdminProfile::query()->where('user_id', $strippedAdmin->id)->update(['agency_role_id' => $withoutRemove->id]);

        $this->remove($strippedAdmin, $this->member('agent'))->assertForbidden();
        $this->remove($remover, $this->member('agent'))->assertOk();
        $this->remove($this->member('agent'), $this->member('agent'))->assertForbidden();
    }

    /** AC13 — gardes inchangées. */
    public function test_primary_admin_and_last_admin_stay_protected(): void
    {
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
        $this->remove($this->admin, $this->admin)->assertStatus(422);

        $solo = Agency::factory()->create();
        $onlyAdmin = User::factory()->create();
        $this->materializeRoleProfile($onlyAdmin, 'agency_admin', $solo);
        $this->actingAsApi($onlyAdmin)->deleteJson("/api/agencies/{$solo->id}/members/{$onlyAdmin->id}")->assertStatus(422);
        $this->assertNotSoftDeleted('agency_admin_profiles', ['user_id' => $onlyAdmin->id]);
    }

    /** AC23 */
    public function test_an_admin_without_agent_profile_is_removed_and_a_landlord_is_not_staff(): void
    {
        $otherAdmin = $this->member('agency_admin');

        $this->remove($this->admin, $otherAdmin)->assertOk()->assertJsonPath('data.removed_profiles', ['agency_admin']);
        $this->assertSoftDeleted('agency_admin_profiles', ['user_id' => $otherAdmin->id]);
        $this->assertSame('agency_admin_removed', Activity::query()->where('log_name', 'Membership')->sole()->event);

        $landlord = $this->member('owner');
        $this->remove($this->admin, $landlord)
            ->assertStatus(422)
            ->assertJsonPath('code', 'member_not_staff');
    }

    /** AC21 — retiré avec `leave_unassigned`, l'agent ne reçoit plus la visite qui lui reste assignée. */
    public function test_an_agent_removed_with_leave_unassigned_loses_the_calendar_of_the_agency(): void
    {
        $agent = $this->member('agent');
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->member('owner')->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'agent_id' => $agent->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2),
        ]);
        $uri = '/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addDays(10)->toDateString();

        $this->actingAsApi($agent)->apiGet($uri)->assertOk()->assertJsonCount(1, 'data');

        $this->remove($this->admin, $agent, ['leave_unassigned' => true])->assertOk();

        $this->assertSame($agent->id, $visit->fresh()->agent_id);
        $this->actingAsApi($agent->fresh())->apiGet($uri)->assertOk()->assertJsonCount(0, 'data');
    }

    /**
     * AC21, étendu (verif-591 B1) — retiré avec `leave_unassigned`, l'agent perd aussi la tâche et
     * l'intervention qui lui restent assignées : ni lecture, ni écriture, ni agenda. Et il ne
     * recrée pas de lien d'agenda hors agence : ce lien-là est celui du prestataire (ADR-0034 §2).
     */
    public function test_an_agent_removed_with_leave_unassigned_loses_his_tasks_interventions_and_feed(): void
    {
        $agent = $this->member('agent');
        $task = $this->openTaskFor($agent);
        $task->update(['due_at' => now()->addDays(2)]);
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->member('owner')->id]);
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'assigned_to' => $agent->id,
            'status' => MaintenanceStatus::Assigned,
            'scheduled_at' => now()->addDays(3),
        ]);
        $uri = '/api/calendar?types[]=task&types[]=maintenance&start_date='.now()->toDateString().'&end_date='.now()->addDays(10)->toDateString();

        $this->actingAsApi($agent)->apiGet($uri)->assertOk()->assertJsonCount(2, 'data');
        $this->actingAsApi($agent)->apiGet("/api/tasks/{$task->id}")->assertOk();

        $this->remove($this->admin, $agent, ['leave_unassigned' => true])->assertOk();
        $agent = $agent->fresh();

        $this->assertSame($agent->id, $task->fresh()->assigned_to_id);
        $this->actingAsApi($agent)->apiGet($uri)->assertOk()->assertJsonCount(0, 'data');
        $this->actingAsApi($agent)->apiGet('/api/tasks')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAsApi($agent)->apiGet("/api/tasks/{$task->id}")->assertForbidden();
        $this->actingAsApi($agent)->apiPut("/api/tasks/{$task->id}", ['status' => 'done'])->assertForbidden();
        $this->assertNotSame('done', $task->fresh()->status?->value);

        $this->actingAsApi($agent)->apiPost('/api/me/calendar-feed')
            ->assertForbidden()
            ->assertJsonPath('code', 'calendar_feed_not_staff');
        $this->assertSame(0, CalendarFeed::query()->where('user_id', $agent->id)->whereNull('revoked_at')->count());
    }

    /** ADR-0034 §2 — le prestataire garde son lien hors agence ; un lien hors agence d'un autre compte n'est pas servi. */
    public function test_only_a_provider_is_served_an_agencyless_feed(): void
    {
        $provider = User::factory()->create();
        ServiceProviderProfile::factory()->create(['user_id' => $provider->id]);
        $url = $this->actingAsApi($provider)->apiPost('/api/me/calendar-feed')->assertCreated()->json('data.url');
        $this->app['auth']->forgetGuards();
        $this->get((string) parse_url($url, PHP_URL_PATH))->assertOk();

        // Un lien hors agence posé avant la garde, pour un compte qui n'est pas prestataire.
        $token = str_repeat('a', 40);
        CalendarFeed::query()->create([
            'user_id' => $this->member('agent')->id,
            'agency_id' => null,
            'token_hash' => CalendarFeed::hashToken($token),
        ]);
        $this->get("/api/calendar-feed/{$token}.ics")->assertNotFound();
    }
}
