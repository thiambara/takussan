<?php

namespace Tests\Feature\Dashboard;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\ThresholdAlert;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use RuntimeException;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2627 — AC2 et AC4 : chaque déclenchement laisse une entrée au journal (`threshold_alert`,
 * `triggered`), écrite avec `last_triggered_at` AVANT l'envoi : un envoi qui lève ne l'efface pas
 * (TCK-1249). `include=triggers` rend les dix dernières, la plus récente d'abord.
 */
class ThresholdAlertTriggersHistoryTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
    }

    public function test_ac2_two_passes_give_two_dated_entries_most_recent_first(): void
    {
        Notification::fake();
        $alert = $this->alwaysFiring();

        $this->artisan('dashboard:check-alerts')->assertExitCode(0);
        Carbon::setTestNow('2026-11-16 11:00:00');
        $this->artisan('dashboard:check-alerts')->assertExitCode(0);
        $this->artisan('dashboard:check-alerts')->assertExitCode(0); // dans la fenêtre : rien

        $row = $this->actingAsApi($this->admin)->getJson('/api/threshold-alerts?include=triggers')->assertOk()->json('data.0');

        $this->assertSame($alert->id, $row['id']);
        $this->assertCount(2, $row['triggers']);
        $this->assertSame('2026-11-16T11:00:00+00:00', $row['triggers'][0]['at']);
        $this->assertSame('2026-11-15T10:00:00+00:00', $row['triggers'][1]['at']);
        $this->assertEquals(0, $row['triggers'][0]['value']);

        $entry = Activity::query()->where('log_name', 'threshold_alert')->latest('id')->firstOrFail();
        $this->assertSame('triggered', $entry->event);
        $this->assertSame($alert->getMorphClass(), $entry->subject_type);
        $this->assertSame($this->agency->id, $entry->agency_id);
        $this->assertEquals(-1, $entry->properties['threshold']);
        $this->assertSame('>', $entry->properties['operator']);
        $this->assertSame(1, $entry->properties['recipients_count']);

        $show = $this->getJson("/api/threshold-alerts/{$alert->id}?include=triggers")->assertOk()->json('data');
        $this->assertCount(2, $show['triggers']);
    }

    public function test_ac2_a_send_that_throws_keeps_the_entry(): void
    {
        Notification::shouldReceive('send')->once()->andThrow(new RuntimeException('envoi en panne (test)'));
        $alert = $this->alwaysFiring();

        $this->artisan('dashboard:check-alerts')->assertExitCode(0);

        $this->assertNotNull($alert->fresh()->last_triggered_at);
        $this->assertSame(1, Activity::query()->where('log_name', 'threshold_alert')->where('subject_id', $alert->id)->count());
    }

    public function test_only_the_ten_latest_entries_are_returned_and_without_include_none(): void
    {
        Notification::fake();
        $alert = $this->alwaysFiring();
        $other = $this->alwaysFiring();
        foreach (range(0, 11) as $day) {
            Carbon::setTestNow(Carbon::parse('2026-11-01 08:00:00')->addDays($day));
            $this->artisan('dashboard:check-alerts')->assertExitCode(0);
        }

        $rows = collect($this->actingAsApi($this->admin)->getJson('/api/threshold-alerts?include=triggers')->assertOk()->json('data'))->keyBy('id');

        $this->assertCount(10, $rows[$alert->id]['triggers']);
        $this->assertSame('2026-11-12T08:00:00+00:00', $rows[$alert->id]['triggers'][0]['at']);
        $this->assertSame('2026-11-03T08:00:00+00:00', $rows[$alert->id]['triggers'][9]['at']);
        $this->assertCount(10, $rows[$other->id]['triggers']);
        $this->assertArrayNotHasKey('triggers', $this->getJson('/api/threshold-alerts')->json('data.0'));
    }

    private function alwaysFiring(): ThresholdAlert
    {
        return ThresholdAlert::create([
            'agency_id' => $this->agency->id,
            'metric' => 'overdue_count',
            'operator' => '>',
            'threshold' => -1,
            'severity' => 'warning',
            'is_enabled' => true,
            'cooldown_hours' => 24,
        ]);
    }
}
