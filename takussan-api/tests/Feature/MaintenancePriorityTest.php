<?php

namespace Tests\Feature;

use App\Jobs\EscalateUrgentMaintenanceJob;
use App\Models\Agency;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class MaintenancePriorityTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_priority_is_normal(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Test',
            'description' => 'Desc',
            'category' => 'plumbing',
        ]);

        $response->assertStatus(201);
        $this->assertEquals('normal', $response->json('data.priority'));
    }

    public function test_can_set_priority_to_urgent_and_dispatches_notification(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $manager = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $manager->id]);

        $user = User::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Urgent leak',
            'description' => 'Water everywhere',
            'category' => 'plumbing',
            'priority' => 'urgent',
        ]);

        $response->assertStatus(201);
        $this->assertEquals('urgent', $response->json('data.priority'));

        Notification::assertSentTo($manager, UrgentMaintenanceCreatedNotification::class);
    }

    public function test_escalation_job_triggers_for_unhandled_urgent_requests(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $manager = User::factory()->create();
        $agency->update(['primary_admin_id' => $manager->id]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);

        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'priority' => MaintenancePriority::Urgent->value,
            'status' => MaintenanceStatus::Open->value,
            'created_at' => now()->subMinutes(35),
            'metadata' => [],
        ]);

        $job = new EscalateUrgentMaintenanceJob;
        $job->handle(app(NotificationService::class));

        Notification::assertSentTo($manager, UrgentMaintenanceCreatedNotification::class);
        $mr->refresh();
        $this->assertNotNull($mr->metadata['escalated_at']);
    }
}
