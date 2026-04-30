<?php

namespace Tests\Feature\Api;

use App\Jobs\SendPropertyVisitReminders;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\VisitReminderNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ScheduledJobsTest extends TestCase
{
    use RefreshDatabase;

    public function test_visit_reminder_job_sends_notifications(): void
    {
        Notification::fake();

        $agent = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create();

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $agent->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDay(),
        ]);

        (new SendPropertyVisitReminders)->handle();

        Notification::assertSentTo($agent, VisitReminderNotification::class);
        Notification::assertSentTo($visitor, VisitReminderNotification::class);
    }

    public function test_visit_reminder_ignores_non_tomorrow_visits(): void
    {
        Notification::fake();

        $agent = User::factory()->create();
        $property = Property::factory()->create();

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(5),
        ]);

        (new SendPropertyVisitReminders)->handle();

        Notification::assertNothingSentTo($agent);
    }
}
