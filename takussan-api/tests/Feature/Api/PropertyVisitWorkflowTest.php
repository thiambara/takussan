<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendPropertyVisitReminders;
use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Support\EnvoisParCode;
use Tests\TestCase;

/**
 * TCK-075 — Covers business rules that go beyond basic CRUD:
 * overlap protection, 3-visits quota per customer, reminder dispatch
 * (24h + 1h), notifications on requested/confirmed, feedback lockout.
 */
class PropertyVisitWorkflowTest extends TestCase
{
    use EnvoisParCode;
    use RefreshDatabase;

    public function test_requesting_a_visit_notifies_property_owner(): void
    {
        Notification::fake();

        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($visitor);

        $this->postJson('/api/property-visits', [
            'property_id' => $property->id,
            'scheduled_at' => now()->addDays(2)->setTime(10, 0)->toIso8601String(),
            'type' => VisitType::InPerson->value,
            'duration_minutes' => 30,
        ])->assertCreated();

        Notification::assertSentTo($owner, CodedNotification::class, self::deCode(NotificationCode::VisitRequested));
    }

    public function test_confirming_a_visit_notifies_the_visitor(): void
    {
        Notification::fake();

        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'scheduled_at' => now()->addDays(3),
            'duration_minutes' => 30,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/confirm")
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed');

        Notification::assertSentTo($visitor, CodedNotification::class, self::deCode(NotificationCode::VisitConfirmed));
    }

    public function test_confirming_overlapping_visit_returns_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        // 1h visit starting in 2 days, already confirmed.
        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(2)->setTime(10, 0),
            'duration_minutes' => 60,
        ]);

        // 1h visit starting 30 min inside the confirmed one.
        $pending = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2)->setTime(10, 30),
            'duration_minutes' => 60,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$pending->id}/confirm")
            ->assertStatus(422);

        $this->assertSame(
            VisitStatus::Scheduled->value,
            $pending->fresh()->status?->value,
        );
    }

    public function test_non_overlapping_visit_can_still_be_confirmed(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(2)->setTime(10, 0),
            'duration_minutes' => 60,
        ]);

        $pending = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2)->setTime(13, 0),
            'duration_minutes' => 60,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$pending->id}/confirm")
            ->assertOk();
    }

    public function test_fourth_active_visit_on_same_property_returns_422(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        // Pre-seed 3 active visits.
        for ($i = 0; $i < 3; $i++) {
            PropertyVisit::factory()->create([
                'property_id' => $property->id,
                'visitor_id' => $visitor->id,
                'status' => $i === 0 ? VisitStatus::Confirmed : VisitStatus::Scheduled,
                'scheduled_at' => now()->addDays($i + 1),
            ]);
        }

        Sanctum::actingAs($visitor);

        $this->postJson('/api/property-visits', [
            'property_id' => $property->id,
            'scheduled_at' => now()->addDays(10)->setTime(10, 0)->toIso8601String(),
            'type' => VisitType::InPerson->value,
        ])->assertStatus(422);
    }

    public function test_reminder_job_dispatches_24h_notification(): void
    {
        Notification::fake();

        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addHours(24),
            'duration_minutes' => 30,
        ]);

        (new SendPropertyVisitReminders)->handle();

        Notification::assertSentTo($visitor, CodedNotification::class, function (CodedNotification $notif) {
            return $notif->code === NotificationCode::VisitReminder && $notif->params['window'] === '24h';
        });
    }

    public function test_reminder_job_dispatches_1h_notification(): void
    {
        Notification::fake();

        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addMinutes(60),
            'duration_minutes' => 30,
        ]);

        (new SendPropertyVisitReminders)->handle();

        Notification::assertSentTo($visitor, CodedNotification::class, function (CodedNotification $notif) {
            return $notif->code === NotificationCode::VisitReminder && $notif->params['window'] === '1h';
        });
    }

    public function test_reminder_job_is_idempotent_on_same_window(): void
    {
        Notification::fake();

        $visitor = User::factory()->create();
        $property = Property::factory()->create();

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addHours(24),
            'duration_minutes' => 30,
        ]);

        (new SendPropertyVisitReminders)->handle();
        (new SendPropertyVisitReminders)->handle();

        Notification::assertSentToTimes($visitor, CodedNotification::class, 1);
    }

    /**
     * TCK-1314 (P126.02) — l'agent de la visite suspendu de l'agence du bien ne reçoit plus le
     * rappel : les admins actifs de l'agence le reçoivent à sa place.
     */
    public function test_reminder_skips_a_suspended_agent_and_reminds_the_active_admins(): void
    {
        Notification::fake();

        [$agency, $admin] = $this->agencyWithAdmin();
        $agent = $this->agentOf($agency, AgentProfileStatus::Suspended);
        $visitor = $this->confirmedVisitTomorrow($agency, $agent);

        (new SendPropertyVisitReminders)->handle();

        Notification::assertSentToTimes($visitor, CodedNotification::class, 1);
        Notification::assertNotSentTo($agent, CodedNotification::class);
        Notification::assertSentTo($admin, CodedNotification::class, fn (CodedNotification $n) => $n->code === NotificationCode::VisitReminder);
    }

    public function test_reminder_goes_to_an_active_agent_and_not_to_the_admins(): void
    {
        Notification::fake();

        [$agency, $admin] = $this->agencyWithAdmin();
        $agent = $this->agentOf($agency, AgentProfileStatus::Active);
        $this->confirmedVisitTomorrow($agency, $agent);

        (new SendPropertyVisitReminders)->handle();

        Notification::assertSentTo($agent, CodedNotification::class, fn (CodedNotification $n) => $n->code === NotificationCode::VisitReminder);
        Notification::assertNotSentTo($admin, CodedNotification::class);
    }

    public function test_reminder_of_an_unassigned_visit_reminds_no_admin(): void
    {
        Notification::fake();

        [$agency, $admin] = $this->agencyWithAdmin();
        $visitor = $this->confirmedVisitTomorrow($agency, null);

        (new SendPropertyVisitReminders)->handle();

        Notification::assertSentToTimes($visitor, CodedNotification::class, 1);
        Notification::assertNotSentTo($admin, CodedNotification::class);
    }

    /** @return array{0: Agency, 1: User} */
    private function agencyWithAdmin(): array
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        return [$agency, $admin];
    }

    private function agentOf(Agency $agency, AgentProfileStatus $status): User
    {
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id, 'status' => $status]);

        return $user;
    }

    private function confirmedVisitTomorrow(Agency $agency, ?User $agent): User
    {
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'agent_id' => $agent?->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addHours(24),
            'duration_minutes' => 30,
        ]);

        return $visitor;
    }

    public function test_visitor_can_submit_feedback_after_completion(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Completed,
            'completed_at' => now()->subHour(),
        ]);

        Sanctum::actingAs($visitor);

        $this->postJson("/api/property-visits/{$visit->id}/feedback", [
            'role' => 'customer',
            'rating' => 4.5,
            'comment' => 'Agréable et professionnel.',
        ])->assertOk()
            ->assertJsonPath('data.rating', 4.5)
            ->assertJsonPath('data.feedback', 'Agréable et professionnel.');
    }

    public function test_agent_can_submit_separate_feedback(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Completed,
            'completed_at' => now()->subHour(),
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/feedback", [
            'role' => 'agent',
            'rating' => 5,
            'comment' => 'Bon contact avec le visiteur.',
        ])->assertOk();

        $fresh = $visit->fresh();
        $this->assertNotNull($fresh->metadata['feedback_agent'] ?? null);
        $this->assertEquals(5, $fresh->metadata['feedback_agent']['rating']);
        $this->assertSame('Bon contact avec le visiteur.', $fresh->metadata['feedback_agent']['comment']);
    }

    public function test_feedback_is_locked_past_24h_window(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Completed,
            'completed_at' => now()->subHours(30),
        ]);

        Sanctum::actingAs($visitor);

        $this->postJson("/api/property-visits/{$visit->id}/feedback", [
            'role' => 'customer',
            'rating' => 4,
        ])->assertStatus(422);
    }

    public function test_feedback_is_blocked_before_completion(): void
    {
        $visitor = User::factory()->create();
        $property = Property::factory()->create();

        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Confirmed,
        ]);

        Sanctum::actingAs($visitor);

        $this->postJson("/api/property-visits/{$visit->id}/feedback", [
            'role' => 'customer',
            'rating' => 4,
        ])->assertStatus(422);
    }

    public function test_visitor_can_cancel_via_delete(): void
    {
        $visitor = User::factory()->create();
        $visit = PropertyVisit::factory()->create(['visitor_id' => $visitor->id]);

        Sanctum::actingAs($visitor);

        $this->deleteJson("/api/property-visits/{$visit->id}", ['reason' => 'indisponible'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_listing_supports_scheduled_at_range_filter(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        // A past and a future visit.
        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => now()->subDays(5),
        ]);
        $upcoming = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(5),
        ]);

        Sanctum::actingAs($visitor);

        $response = $this->getJson('/api/property-visits?filter[scheduled_at_min]='.now()->toDateString())
            ->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($upcoming->id, $ids);
        $this->assertCount(1, $ids);
    }
}
