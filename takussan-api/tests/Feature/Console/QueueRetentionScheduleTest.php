<?php

namespace Tests\Feature\Console;

use App\Models\User;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-803 (P19.07) — rétention de la file et nom du journal de `User`.
 *
 * ADR-0044, amendement du 2026-10-16 (TCK-723) : un job échoué se conserve 30 jours, `payload`
 * compris, et `queue:prune-batches` est planifiée.
 */
class QueueRetentionScheduleTest extends TestCase
{
    use RefreshDatabase;

    private function planifiee(string $commande): ?Event
    {
        return collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => str_contains((string) $e->command, $commande));
    }

    public function test_les_jobs_echoues_sont_purges_a_30_jours_chaque_jour(): void
    {
        $event = $this->planifiee('queue:prune-failed');

        $this->assertNotNull($event, 'queue:prune-failed doit être planifiée.');
        $this->assertStringContainsString('--hours=720', (string) $event->command);
        $this->assertMatchesRegularExpression('/^\d+ \d+ \* \* \*$/', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    public function test_les_lots_de_jobs_sont_purges_chaque_jour(): void
    {
        $event = $this->planifiee('queue:prune-batches');

        $this->assertNotNull($event, 'queue:prune-batches doit être planifiée.');
        $this->assertMatchesRegularExpression('/^\d+ \d+ \* \* \*$/', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    /** Le journal des changements d'identité porte son propre nom, et non `default`. */
    public function test_le_journal_de_user_porte_le_nom_user(): void
    {
        $user = User::factory()->create(['first_name' => 'Awa']);
        $user->update(['first_name' => 'Aminata']);

        $journal = Activity::query()
            ->where('subject_type', $user->getMorphClass())
            ->where('subject_id', $user->getKey())
            ->get();

        $this->assertNotEmpty($journal);
        $this->assertSame(['User'], $journal->pluck('log_name')->unique()->values()->all());
    }
}
