<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\RoleDelegation;
use App\Models\Task;
use App\Models\User;
use App\Services\Agency\AgentAvailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-591 AC14 (ADR-0035) — pendant l'absence de X remplacé par Y, Y voit les tâches de X et le
 * résolveur rend Y ; après la fin, plus rien ; aucune ligne existante n'a changé ; aucune capacité
 * n'est accordée.
 */
class AgentAbsenceTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $absent;

    private User $substitute;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->member('agency_admin');
        $this->absent = $this->member('agent');
        $this->substitute = $this->member('agent');
        $this->customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->admin->id]);
    }

    private function member(string $role, ?Agency $agency = null): User
    {
        // TCK-589 (fusion) — un admin d'agence agit avec un second facteur : retirer, passer,
        // déclarer une absence sont des gestes d'équipe protégés (`ProtectedActions`).
        $user = User::factory()->create($role === 'agency_admin'
            ? ['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]
            : []);
        $this->materializeRoleProfile($user, $role, $agency ?? $this->agency);

        return $user;
    }

    private function taskOf(User $assignee): Task
    {
        return Task::factory()->forCustomer($this->customer)->create([
            'created_by_id' => $this->admin->id,
            'assigned_to_id' => $assignee->id,
            'due_at' => now()->addDay(),
        ]);
    }

    /** @param array<string, mixed> $overrides */
    private function declare(User $as, array $overrides = [])
    {
        return $this->actingAsApi($as)->apiPost("/api/agencies/{$this->agency->id}/absences", array_merge([
            'user_id' => $this->absent->id,
            'substitute_id' => $this->substitute->id,
            'ends_at' => now()->addDays(5)->toIso8601String(),
        ], $overrides));
    }

    /** @return array<string, bool> */
    private function capabilitiesOf(User $user): array
    {
        $map = [];
        foreach (Capability::cases() as $capability) {
            $map[$capability->value] = $user->fresh()->canActAt($capability, $this->agency);
        }

        return $map;
    }

    public function test_the_substitute_sees_and_ticks_the_absent_tasks_until_the_end(): void
    {
        $task = $this->taskOf($this->absent);
        $tasksBefore = DB::table('tasks')->orderBy('id')->get()->toJson();
        $capabilitiesBefore = $this->capabilitiesOf($this->substitute);

        $this->declare($this->admin)->assertCreated()->assertJsonPath('data.absent.id', $this->absent->id);

        // Aucune ligne existante n'a changé ; aucune capacité accordée ; aucune notification de rôle.
        $this->assertSame($tasksBefore, DB::table('tasks')->orderBy('id')->get()->toJson());
        $this->assertSame($capabilitiesBefore, $this->capabilitiesOf($this->substitute));
        $this->assertSame(0, AppNotification::query()->count());

        $availability = app(AgentAvailability::class);
        $this->assertSame($this->substitute->id, $availability->substituteFor($this->absent, $this->agency->id)->id);

        $this->actingAsApi($this->substitute)->apiGet('/api/tasks')
            ->assertOk()
            ->assertJsonPath('data.0.id', $task->id);
        $this->actingAsApi($this->substitute)->apiGet("/api/tasks/{$task->id}")->assertOk();
        $this->actingAsApi($this->substitute)->apiPut("/api/tasks/{$task->id}", ['status' => 'done'])->assertOk();
        $this->actingAsApi($this->substitute)->apiDelete("/api/tasks/{$task->id}")->assertForbidden();

        // Une tâche confiée à l'absent part chez le remplaçant.
        $this->actingAsApi($this->admin)->apiPost('/api/tasks', [
            'title' => 'Rappeler le client',
            'taskable_type' => Customer::class,
            'taskable_id' => $this->customer->id,
            'assigned_to_id' => $this->absent->id,
        ])->assertCreated()->assertJsonPath('data.assignee.id', $this->substitute->id);

        $this->travelTo(now()->addDays(6));

        $this->assertSame($this->absent->id, $availability->substituteFor($this->absent, $this->agency->id)->id);
        $this->actingAsApi($this->substitute)->apiGet("/api/tasks/{$task->id}")->assertForbidden();
        $this->assertNotContains(
            $task->id,
            collect($this->actingAsApi($this->substitute)->apiGet('/api/tasks')->assertOk()->json('data'))->pluck('id')->all(),
        );
    }

    /**
     * verif-591 M5 — un remplaçant SUSPENDU ne couvre plus : il ne voit ni ne coche les tâches de
     * l'absent, et une tâche confiée à l'absent reste à l'absent. Réactivé, il couvre à nouveau.
     */
    public function test_a_suspended_substitute_no_longer_covers(): void
    {
        $task = $this->taskOf($this->absent);
        $this->declare($this->admin)->assertCreated();
        AgentProfile::query()->where('user_id', $this->substitute->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $substitute = $this->substitute->fresh();

        $this->assertNotContains(
            $task->id,
            collect($this->actingAsApi($substitute)->apiGet('/api/tasks')->assertOk()->json('data'))->pluck('id')->all(),
        );
        $this->actingAsApi($substitute)->apiPut("/api/tasks/{$task->id}", ['status' => 'done'])->assertForbidden();
        $this->assertNotSame('done', $task->fresh()->status?->value);

        $this->actingAsApi($this->admin)->apiPost('/api/tasks', [
            'title' => 'Rappeler le client',
            'taskable_type' => Customer::class,
            'taskable_id' => $this->customer->id,
            'assigned_to_id' => $this->absent->id,
        ])->assertCreated()->assertJsonPath('data.assignee.id', $this->absent->id);

        AgentProfile::query()->where('user_id', $this->substitute->id)->update(['status' => AgentProfileStatus::Active->value]);
        $this->assertSame(
            $this->substitute->id,
            app(AgentAvailability::class)->substituteFor($this->absent, $this->agency->id)->id,
        );
    }

    /**
     * verif-591 m3 — le motif d'une absence (une donnée de santé, souvent) ne va qu'à l'absent, à
     * l'auteur de la déclaration et au titulaire de `team.delegate_role` ; un collègue voit qui
     * couvre qui, sans le pourquoi.
     */
    public function test_the_absence_reason_is_read_only_by_the_absent_the_author_and_the_delegator(): void
    {
        $this->declare($this->admin, ['reason' => 'Hospitalisation'])->assertCreated();
        $uri = "/api/agencies/{$this->agency->id}/absences";
        $reasonFor = function (User $as) use ($uri) {
            $row = $this->actingAsApi($as)->apiGet($uri)->assertOk()->json('data.0');
            $this->app['auth']->forgetGuards();

            return [$row['absent']['id'], $row['reason']];
        };

        $this->assertSame([$this->absent->id, 'Hospitalisation'], $reasonFor($this->absent));
        $this->assertSame([$this->absent->id, 'Hospitalisation'], $reasonFor($this->admin));
        $this->assertSame([$this->absent->id, null], $reasonFor($this->member('agent')));
        $this->assertSame([$this->absent->id, null], $reasonFor($this->substitute));
    }

    public function test_the_substitute_does_not_cover_the_tasks_of_another_agency(): void
    {
        $otherAgency = Agency::factory()->create();
        $this->materializeRoleProfile($this->absent, 'agent', $otherAgency);
        $elsewhere = Task::factory()->forCustomer(Customer::factory()->create(['agency_id' => $otherAgency->id]))->create([
            'created_by_id' => $this->absent->id,
            'assigned_to_id' => $this->absent->id,
        ]);

        $this->declare($this->admin)->assertCreated();

        $this->actingAsApi($this->substitute)->apiGet("/api/tasks/{$elsewhere->id}")->assertForbidden();
    }

    public function test_an_overlapping_absence_is_refused(): void
    {
        $this->declare($this->admin)->assertCreated();

        $this->declare($this->admin, [
            'substitute_id' => $this->admin->id,
            'starts_at' => now()->addDays(2)->toIso8601String(),
            'ends_at' => now()->addDays(10)->toIso8601String(),
        ])->assertStatus(422)->assertJsonPath('code', 'agent_absence.overlaps');

        $this->declare($this->admin, [
            'starts_at' => now()->addDays(6)->toIso8601String(),
            'ends_at' => now()->addDays(10)->toIso8601String(),
        ])->assertCreated()->assertJsonPath('data.status', 'scheduled');
    }

    public function test_both_must_be_staff_and_distinct(): void
    {
        $landlord = $this->member('owner');

        $this->declare($this->admin, ['substitute_id' => $landlord->id])
            ->assertStatus(422)->assertJsonValidationErrors('substitute_id');
        $this->declare($this->admin, ['substitute_id' => $this->absent->id])
            ->assertStatus(422)->assertJsonValidationErrors('substitute_id');
        $this->declare($this->admin, ['substitute_id' => $this->member('agent', Agency::factory()->create())->id])
            ->assertStatus(422)->assertJsonValidationErrors('substitute_id');
    }

    public function test_an_agent_declares_his_own_absence_but_not_a_colleague(): void
    {
        $this->declare($this->absent)->assertCreated();

        $this->declare($this->substitute, ['user_id' => $this->admin->id, 'substitute_id' => $this->absent->id])
            ->assertForbidden();
        $this->declare($this->member('owner'))->assertForbidden();
    }

    public function test_the_delegation_console_does_not_list_absences_and_revocation_ends_it(): void
    {
        $id = $this->declare($this->admin)->assertCreated()->json('data.id');

        $this->actingAsApi($this->admin)->apiGet("/api/agencies/{$this->agency->id}/role-delegations")
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->actingAsApi($this->substitute)->apiGet("/api/agencies/{$this->agency->id}/absences")
            ->assertOk()
            ->assertJsonPath('data.0.id', $id);

        $this->actingAsApi($this->substitute)->apiDelete("/api/agencies/{$this->agency->id}/absences/{$id}")->assertForbidden();
        $this->actingAsApi($this->absent)->apiDelete("/api/agencies/{$this->agency->id}/absences/{$id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked');

        $this->assertSame($this->absent->id, app(AgentAvailability::class)->substituteFor($this->absent, $this->agency->id)->id);
        $this->assertSame(0, AppNotification::query()->count());
        $this->assertSame(RoleDelegation::ABSENCE_ROLE, RoleDelegation::query()->sole()->role);
    }
}
