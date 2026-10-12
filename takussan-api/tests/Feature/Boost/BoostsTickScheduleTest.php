<?php

namespace Tests\Feature\Boost;

use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §9) — `boosts:tick` est planifié toutes les 5 minutes, sans chevauchement. */
class BoostsTickScheduleTest extends TestCase
{
    public function test_le_tick_est_planifie(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'boosts:tick'));

        $this->assertCount(1, $events);
        $this->assertSame('*/5 * * * *', $events->first()->expression);
        $this->assertTrue($events->first()->withoutOverlapping);
    }
}
