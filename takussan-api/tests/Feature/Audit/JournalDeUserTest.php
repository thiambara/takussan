<?php

namespace Tests\Feature\Audit;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-803 (P19.07) — le journal des changements d'identité porte son propre nom, et non `default`.
 * Déplacé de `QueueRetentionScheduleTest` (TCK-3015) : la rétention de la file y est tenue par
 * `Console\PlanificationTest`, ce test-ci n'avait rien à voir avec la planification.
 */
class JournalDeUserTest extends TestCase
{
    use RefreshDatabase;

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
