<?php

namespace Tests\Feature\Auth\Session;

use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

/**
 * TCK-589 AC10 — les jetons expirés sont purgés : sans `sanctum:prune-expired`
 * planifié, la table `personal_access_tokens` ne fait que grossir. Rouge sur
 * `5f872f1f` (aucune entrée).
 */
class TokenPruneScheduleTest extends TestCase
{
    public function test_le_planificateur_purge_les_jetons_expires(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'sanctum:prune-expired'));

        $this->assertCount(1, $events);
        $this->assertStringContainsString('--hours=24', (string) $events->first()->command);
    }
}
