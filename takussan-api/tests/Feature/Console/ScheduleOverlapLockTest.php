<?php

namespace Tests\Feature\Console;

use Cron\CronExpression;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-737 (P05.01) — le verrou `withoutOverlapping()` d'une tâche ne survit pas à sa période.
 *
 * Un `schedule:run` tué au redéploiement ne rend pas son verrou : il reste dans le cache jusqu'à
 * son échéance, 1 440 minutes par défaut. Une tâche de 5 minutes en sauterait 288 exécutions.
 * Borné à la période, le verrou orphelin ne coûte au plus qu'une exécution.
 */
class ScheduleOverlapLockTest extends TestCase
{
    public function test_no_overlap_lock_outlives_the_period_of_its_task(): void
    {
        $events = collect(app(Schedule::class)->events())->filter(fn (Event $event) => $event->withoutOverlapping);
        $this->assertNotEmpty($events);

        $tooLong = $events
            ->map(fn (Event $event) => [
                'task' => $event->description ?? (string) $event->command,
                'expression' => $event->expression,
                'period' => $this->periodInMinutes($event->expression),
                'expires_at' => $event->expiresAt,
            ])
            ->filter(fn (array $row) => $row['expires_at'] > $row['period'])
            ->values()
            ->all();

        $this->assertSame([], $tooLong, 'Un verrou withoutOverlapping() plus long que la période de sa tâche.');
    }

    private function periodInMinutes(string $expression): int
    {
        $cron = new CronExpression($expression);
        $from = Carbon::parse('2026-10-05 00:00:00');

        return (int) Carbon::instance($cron->getNextRunDate($from, 0))
            ->diffInMinutes(Carbon::instance($cron->getNextRunDate($from, 1)));
    }
}
