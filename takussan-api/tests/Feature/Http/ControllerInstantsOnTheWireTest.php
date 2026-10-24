<?php

namespace Tests\Feature\Http;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-1504 (P94.03) — les instants des réponses composées à la main sortent sous la forme
 * d'ADR-0018, `…T12:34:56+00:00`. Deux cas témoins des deux anciennes formes :
 *
 *   · `TaskController::format` émettait `toISOString()` → `…T12:34:56.000000Z` ;
 *   · `AuditLogController` rendait `created_at` en Carbon brut, sérialisé de même.
 *
 * Le second n'est pas vu par `ControllerInstantFormTest` (liste noire d'appels) : il n'y a pas
 * d'appel à refuser dans un attribut rendu brut. Ce test l'épingle par la valeur.
 */
class ControllerInstantsOnTheWireTest extends TestCase
{
    use RefreshDatabase;

    public function test_task_instants_use_the_adr_0018_form(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $task = Task::create([
            'title' => 'Relancer',
            'taskable_id' => $customer->id,
            'taskable_type' => Customer::class,
            'created_by_id' => $user->id,
            'status' => TaskStatus::Open,
            'priority' => TaskPriority::Medium,
            'due_at' => Carbon::parse('2026-10-18 21:54:01', 'UTC'),
        ]);

        Sanctum::actingAs($user);

        $this->getJson("/api/tasks/{$task->id}")
            ->assertOk()
            ->assertJsonPath('data.due_at', '2026-10-18T21:54:01+00:00')
            ->assertJsonPath('data.created_at', $task->created_at->utc()->format(DATE_ATOM));
    }

    public function test_audit_log_created_at_uses_the_adr_0018_form(): void
    {
        $admin = User::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);

        $entree = Activity::create([
            'log_name' => 'default',
            'description' => 'created',
            'subject_type' => User::class,
            'subject_id' => $admin->id,
            'causer_type' => User::class,
            'causer_id' => $admin->id,
            'event' => 'created',
        ]);
        $entree->forceFill(['created_at' => Carbon::parse('2026-10-18 21:54:01', 'UTC')])->save();

        $ligne = collect($this->getJson('/api/audit-log')->assertOk()->json('data'))->firstWhere('id', $entree->id);

        $this->assertSame('2026-10-18T21:54:01+00:00', $ligne['created_at']);
    }
}
