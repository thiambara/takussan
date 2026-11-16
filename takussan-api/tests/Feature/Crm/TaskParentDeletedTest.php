<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TaskStatus;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-617 AC6, point 5 (décision du porteur, 2026-11-16) — la tâche d'un parent supprimé en douceur
 * reste dans la liste de son responsable, MARQUÉE (`parent_deleted`), sans le libellé du parent ; la
 * liste rend ce que le détail rend. Dans l'autre sens : le parent supprimé d'une AUTRE agence ne
 * rend pas sa tâche, et un parent effacé pour de bon reste hors liste comme hors détail.
 */
class TaskParentDeletedTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
    }

    private function task(Property|Customer $parent): Task
    {
        return Task::factory()->create([
            'title' => 'Relancer pour le dossier',
            'status' => TaskStatus::Open,
            'taskable_type' => $parent::class,
            'taskable_id' => $parent->id,
            'assigned_to_id' => $this->agent->id,
            'created_by_id' => $this->agent->id,
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    private function listed(): array
    {
        return collect($this->actingAsApi($this->agent)->apiGet('/api/tasks')->assertOk()->json('data'))
            ->keyBy('id')->all();
    }

    public function test_the_task_of_a_soft_deleted_property_stays_listed_and_marked(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Villa Almadies']);
        $kept = $this->task(Property::factory()->create(['agency_id' => $this->agency->id]));
        $task = $this->task($property);
        $property->delete();

        $rows = $this->listed();
        $this->assertArrayHasKey($task->id, $rows);
        $this->assertTrue($rows[$task->id]['parent_deleted']);
        $this->assertNull($rows[$task->id]['taskable']['label']);
        $this->assertFalse($rows[$kept->id]['parent_deleted']);

        // La liste ⊇ le détail : la même tâche s'ouvre, marquée.
        $this->actingAsApi($this->agent)->apiGet("/api/tasks/{$task->id}")
            ->assertOk()
            ->assertJsonPath('data.parent_deleted', true);
        $this->assertStringNotContainsString('Villa Almadies', json_encode($rows));
    }

    public function test_the_task_of_a_soft_deleted_customer_stays_listed_and_marked(): void
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $task = $this->task($customer);
        $customer->delete();

        $rows = $this->listed();
        $this->assertArrayHasKey($task->id, $rows);
        $this->assertTrue($rows[$task->id]['parent_deleted']);
    }

    public function test_the_deleted_parent_of_another_agency_does_not_leak_its_task(): void
    {
        $other = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $task = $this->task($other);
        $other->delete();

        $this->assertArrayNotHasKey($task->id, $this->listed());
        $this->assertContains($this->actingAsApi($this->agent)->apiGet("/api/tasks/{$task->id}")->status(), [403, 404]);
    }

    /** @return array<int, array<string, mixed>> les tâches de « Mes rendez-vous » de l'agenda */
    private function agenda(): array
    {
        $uri = '/api/calendar?types[]=task&mine=1&start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString();

        return collect($this->actingAsApi($this->agent)->apiGet($uri)->assertOk()->json('data'))
            ->where('type', 'task')->keyBy('id')->all();
    }

    /** L'agenda (et donc le flux `.ics`) suit la liste : gardée et marquée chez soi, absente ailleurs. */
    public function test_the_agenda_keeps_and_marks_the_task_of_a_deleted_parent_of_its_own_agency_only(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $own = $this->task($property);
        $own->update(['due_at' => now()->addDays(2)]);
        $property->delete();
        $foreign = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $leak = $this->task($foreign);
        $leak->update(['due_at' => now()->addDays(2)]);
        $foreign->delete();

        $events = $this->agenda();
        $this->assertArrayHasKey($own->id, $events);
        $this->assertTrue($events[$own->id]['parent_deleted']);
        $this->assertNull($events[$own->id]['property_id']);
        $this->assertArrayNotHasKey($leak->id, $events);
    }

    public function test_a_hard_deleted_parent_keeps_the_task_out_of_list_and_detail(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $task = $this->task($property);
        DB::table('tasks')->where('id', $task->id)->update(['taskable_id' => $property->id + 100000]);

        $this->assertArrayNotHasKey($task->id, $this->listed());
    }
}
