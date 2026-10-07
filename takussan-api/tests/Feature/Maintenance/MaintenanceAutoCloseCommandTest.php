<?php

namespace Tests\Feature\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC12 (P10), seconde moitié : sans réponse du demandeur, la demande se clôt d'elle-même
 * au bout de 7 jours — pas avant.
 */
class MaintenanceAutoCloseCommandTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_closes_after_seven_days_and_not_at_six(): void
    {
        ['mr' => $old] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()->subDays(7)->subMinute()]);
        ['mr' => $recent] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()->subDays(6)]);
        ['mr' => $running] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['completed_at' => now()->subDays(30)]);

        $this->artisan('maintenance:auto-close')->assertSuccessful();

        $this->assertSame(MaintenanceStatus::Closed, $old->refresh()->status);
        $this->assertSame(MaintenanceStatus::Completed, $recent->refresh()->status);
        $this->assertSame(MaintenanceStatus::InProgress, $running->refresh()->status);
    }

    public function test_emits_auto_closed_with_a_null_actor(): void
    {
        Event::fake([MaintenanceStatusChanged::class]);
        $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()->subDays(8)]);

        $this->artisan('maintenance:auto-close')->assertSuccessful();

        Event::assertDispatchedTimes(MaintenanceStatusChanged::class, 1);
        Event::assertDispatched(MaintenanceStatusChanged::class, fn (MaintenanceStatusChanged $e): bool => $e->actor === null
            && $e->cause === MaintenanceStatusChanged::CAUSE_AUTO_CLOSED
            && $e->to === MaintenanceStatus::Closed);
    }

    public function test_is_scheduled_daily(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'maintenance:auto-close'));

        $this->assertCount(1, $events);
        $this->assertSame('0 4 * * *', $events->first()->expression);
    }
}
