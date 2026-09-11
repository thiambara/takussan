<?php

namespace Tests\Unit;

use App\Jobs\RefreshNewBuildSearchLabel;
use App\Models\Enums\PropertyCondition;
use App\Models\Enums\PropertyType;
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

    /**
     * TCK-508 — un bien dont l'état est DÉCLARÉ ne dépend plus du temps : son jeton
     * « neuf » suit la colonne, que seule une écriture change — et une écriture
     * réindexe déjà. Le réindexer chaque nuit serait du travail pour rien.
     */
    public function test_le_perimetre_ignore_les_biens_dont_l_etat_est_declare(): void
    {
        Carbon::setTestNow('2030-06-01');

        try {
            $sansEtat = Property::factory()->create(['type' => PropertyType::Villa, 'year_built' => 2029]);
            Property::factory()->create(['type' => PropertyType::Villa, 'year_built' => 2029, 'condition' => PropertyCondition::Good]);
            Property::factory()->create(['type' => PropertyType::Villa, 'year_built' => 2028, 'condition' => PropertyCondition::New]);

            $this->assertSame([$sansEtat->id], RefreshNewBuildSearchLabel::scope()->pluck('id')->all());
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
