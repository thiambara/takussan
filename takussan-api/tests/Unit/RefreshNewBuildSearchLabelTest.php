<?php

namespace Tests\Unit;

use App\Jobs\RefreshNewBuildSearchLabel;
use App\Models\Property;
use App\Support\Search\PropertyLabels;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-506, revue de PR 253 — « neuf » est le seul fait relatif au temps d'un
 * document indexé, et il est figé à l'indexation. Ce job est ce qui le périme.
 */
class RefreshNewBuildSearchLabelTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_perimetre_couvre_les_biens_qui_viennent_de_cesser_detre_neufs(): void
    {
        Carbon::setTestNow('2030-06-01');

        try {
            $ids = [];
            foreach ([2030, 2029, 2028, 2027, null] as $annee) {
                $ids[$annee ?? 'null'] = Property::factory()->create(['year_built' => $annee])->id;
            }

            $perimetre = RefreshNewBuildSearchLabel::scope()->pluck('id')->all();
            sort($perimetre);

            // 2028 est LE cas qui compte : neuf en 2029, plus en 2030 — c'est lui
            // que rien ne réindexait. 2029 et 2030 restent neufs (idempotent).
            $attendu = [$ids[2030], $ids[2029], $ids[2028]];
            sort($attendu);
            $this->assertSame($attendu, $perimetre);
            $this->assertSame(2029, PropertyLabels::anneeNeufMin());
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_le_job_est_planifie_chaque_jour(): void
    {
        $evenements = array_filter(
            app(Schedule::class)->events(),
            static fn (Event $e): bool => $e->description === RefreshNewBuildSearchLabel::class,
        );

        $this->assertCount(1, $evenements, 'le job doit être planifié une fois dans routes/console.php');
        $this->assertSame('0 4 * * *', array_values($evenements)[0]->expression);
    }
}
