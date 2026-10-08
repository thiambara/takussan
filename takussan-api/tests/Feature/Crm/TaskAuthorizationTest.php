<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TaskStatus;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-591 — les quatre gardes des tâches (AC18, et le 422 traduit d'AC20).
 *
 * Chacune rendait l'inverse sur `5f872f1f` : un bailleur était assignable, un `PUT` poussait la
 * tâche chez n'importe qui, l'assigné supprimait la tâche de son admin, et un bailleur rattachait
 * une tâche à n'importe quel client de l'agence.
 */
class TaskAuthorizationTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->member('agent', $this->agency);
    }

    private function member(string $role, Agency $agency): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $agency);

        return $user;
    }

    private function customer(?User $addedBy = null): Customer
    {
        return Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => ($addedBy ?? $this->agent)->id,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ]);
    }

    public function test_a_landlord_of_the_agency_is_not_an_assignable_member(): void
    {
        $landlord = $this->member('owner', $this->agency);
        $customer = $this->customer();

        $this->actingAsApi($this->agent)->apiPost('/api/tasks', [
            'title' => 'Rappeler',
            'taskable_type' => Customer::class,
            'taskable_id' => $customer->id,
            'assigned_to_id' => $landlord->id,
        ])->assertStatus(422)->assertJsonPath('code', 'task.assignee_not_staff');

        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_a_colleague_of_the_agency_is_assignable(): void
    {
        $colleague = $this->member('agent', $this->agency);
        $customer = $this->customer();

        $this->actingAsApi($this->agent)->apiPost('/api/tasks', [
            'title' => 'Rappeler',
            'taskable_type' => Customer::class,
            'taskable_id' => $customer->id,
            'assigned_to_id' => $colleague->id,
        ])->assertCreated()->assertJsonPath('data.assignee.id', $colleague->id);
    }

    public function test_reassigning_by_put_replays_the_assignee_check(): void
    {
        $outsider = $this->member('agent', Agency::factory()->create());
        $task = Task::factory()->forCustomer($this->customer())->create([
            'created_by_id' => $this->agent->id,
            'assigned_to_id' => $this->agent->id,
        ]);

        $this->actingAsApi($this->agent)
            ->apiPut("/api/tasks/{$task->id}", ['assigned_to_id' => $outsider->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'task.assignee_not_staff');

        $this->assertSame($this->agent->id, $task->fresh()->assigned_to_id);
    }

    public function test_only_the_creator_deletes_a_task(): void
    {
        $admin = $this->member('agency_admin', $this->agency);
        $task = Task::factory()->forCustomer($this->customer())->create([
            'created_by_id' => $admin->id,
            'assigned_to_id' => $this->agent->id,
        ]);

        $this->actingAsApi($this->agent)->apiDelete("/api/tasks/{$task->id}")->assertForbidden();
        $this->assertNotSoftDeleted('tasks', ['id' => $task->id]);

        // L'assigné garde `update` : il coche sa tâche.
        $this->actingAsApi($this->agent)
            ->apiPut("/api/tasks/{$task->id}", ['status' => TaskStatus::Done->value])
            ->assertOk();

        $this->actingAsApi($admin)->apiDelete("/api/tasks/{$task->id}")->assertNoContent();
        $this->assertSoftDeleted('tasks', ['id' => $task->id]);
    }

    public function test_a_landlord_cannot_attach_a_task_to_a_customer_he_did_not_add(): void
    {
        $landlord = $this->member('owner', $this->agency);
        $customer = $this->customer();

        $response = $this->actingAsApi($landlord)->apiPost('/api/tasks', [
            'title' => 'Espionner',
            'taskable_type' => Customer::class,
            'taskable_id' => $customer->id,
        ]);

        $response->assertForbidden();
        $this->assertStringNotContainsString('Diop', $response->getContent());
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_the_taskable_label_is_rendered_to_whoever_may_attach_to_the_parent(): void
    {
        $customer = $this->customer();
        $property = Property::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->agent->id,
            'title' => 'Villa des Almadies',
        ]);
        Task::factory()->forCustomer($customer)->create(['created_by_id' => $this->agent->id]);
        Task::factory()->create([
            'taskable_type' => Property::class,
            'taskable_id' => $property->id,
            'created_by_id' => $this->agent->id,
        ]);

        $rows = collect($this->actingAsApi($this->agent)->apiGet('/api/tasks')->assertOk()->json('data'))
            ->keyBy(fn ($row) => $row['taskable']['type']);

        $this->assertSame(
            ['type' => 'customer', 'id' => $customer->id, 'label' => 'Awa Diop', 'phone' => $customer->phone],
            $rows['customer']['taskable'],
        );
        $this->assertSame(
            ['type' => 'property', 'id' => $property->id, 'label' => 'Villa des Almadies', 'phone' => null],
            $rows['property']['taskable'],
        );
    }

    public function test_an_assignee_outside_the_parent_scope_does_not_read_the_label(): void
    {
        // Assignée à un bailleur par le passé (avant la garde). Depuis verif-591 B1, l'affectation
        // ne vaut que pour le personnel de l'agence du parent : il ne voit plus la tâche du tout,
        // ni son libellé.
        $landlord = $this->member('owner', $this->agency);
        $task = Task::factory()->forCustomer($this->customer())->create([
            'created_by_id' => $this->agent->id,
            'assigned_to_id' => $landlord->id,
        ]);

        $this->actingAsApi($landlord)->apiGet("/api/tasks/{$task->id}")->assertForbidden();
        $this->assertSame([], $this->actingAsApi($landlord)->apiGet('/api/tasks')->assertOk()->json('data'));
    }

    /**
     * verif-591 M1 — « soi-même » ne court-circuite plus le contrôle d'assigné sur un parent d'agence :
     * le bailleur qui rattache une tâche à SA fiche ne se l'assigne pas (il n'est pas du personnel).
     * Il la crée sans assigné.
     */
    public function test_assigning_oneself_on_an_agency_parent_requires_being_staff(): void
    {
        $landlord = $this->member('owner', $this->agency);
        $customer = $this->customer($landlord);
        $body = ['title' => 'Rappeler', 'taskable_type' => Customer::class, 'taskable_id' => $customer->id];

        $this->actingAsApi($landlord)->apiPost('/api/tasks', $body + ['assigned_to_id' => $landlord->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'task.assignee_not_staff');
        $this->assertDatabaseCount('tasks', 0);

        $this->actingAsApi($landlord)->apiPost('/api/tasks', $body)->assertCreated();
        $this->actingAsApi($this->agent)->apiPost('/api/tasks', [
            'title' => 'Moi', 'taskable_type' => Customer::class, 'taskable_id' => $this->customer()->id, 'assigned_to_id' => $this->agent->id,
        ])->assertCreated();
    }

    public function test_the_assignee_refusal_is_translated(): void
    {
        $landlord = $this->member('owner', $this->agency);
        $customer = $this->customer();
        $body = [
            'title' => 'Rappeler',
            'taskable_type' => Customer::class,
            'taskable_id' => $customer->id,
            'assigned_to_id' => $landlord->id,
        ];

        $fr = $this->actingAsApi($this->agent)->postJson('/api/tasks', $body, ['Accept-Language' => 'fr'])
            ->assertStatus(422)->json('message');
        $en = $this->actingAsApi($this->agent)->postJson('/api/tasks', $body, ['Accept-Language' => 'en'])
            ->assertStatus(422)->json('message');

        $this->assertSame(__('errors.task.assignee_not_staff', [], 'fr'), $fr);
        $this->assertSame(__('errors.task.assignee_not_staff', [], 'en'), $en);
        $this->assertNotSame($fr, $en);
    }
}
