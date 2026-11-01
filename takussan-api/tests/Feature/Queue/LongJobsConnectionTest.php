<?php

namespace Tests\Feature\Queue;

use App\Jobs\Ai\RunAiEvaluation;
use App\Jobs\Booking\ExpirePendingBookingsJob;
use App\Jobs\Concerns\RunsOnLongQueue;
use App\Jobs\Radar\CrawlRadarSource;
use App\Jobs\SendFavoriteChangeAlerts;
use App\Jobs\SendSavedSearchAlerts;
use App\Jobs\SyncPropertyCalendarFeedJob;
use App\Jobs\SyncPropertyCalendarFeedsJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-2397 (ADR-0078) — les jobs longs passent par `database-long` / `long`, servis par
 * `worker-long` : leur délai de reprise dépasse leur `$timeout`, et ils ne retiennent plus les
 * notifications du worker de `notifications-urgent,default`.
 *
 * La liste est écrite ici ET dérivée du code : un job qui prend le trait sans y figurer, ou qui y
 * figure sans le prendre, fait rougir le test d'inventaire.
 */
class LongJobsConnectionTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<class-string, callable(): object> */
    private static function longJobs(): array
    {
        return [
            SendSavedSearchAlerts::class => fn () => new SendSavedSearchAlerts,
            SendFavoriteChangeAlerts::class => fn () => new SendFavoriteChangeAlerts,
            RunAiEvaluation::class => fn () => new RunAiEvaluation(1),
            SyncPropertyCalendarFeedsJob::class => fn () => new SyncPropertyCalendarFeedsJob,
            ExpirePendingBookingsJob::class => fn () => new ExpirePendingBookingsJob,
            // TCK-2392 — un passage de collecte du Radar : plusieurs pages, chacune jusqu'à 45 s.
            CrawlRadarSource::class => fn () => new CrawlRadarSource(1),
        ];
    }

    public function test_chaque_job_long_vise_la_connexion_longue_quand_la_file_est_en_base(): void
    {
        config()->set('queue.default', 'database');

        foreach (self::longJobs() as $classe => $creer) {
            $job = $creer();
            $this->assertSame('database-long', $job->connection, "{$classe} doit viser database-long");
            $this->assertSame('long', $job->queue, "{$classe} doit viser la file long");
        }
    }

    public function test_un_job_court_reste_sur_la_connexion_et_la_file_par_defaut(): void
    {
        config()->set('queue.default', 'database');

        $job = new SyncPropertyCalendarFeedJob(1);

        $this->assertNull($job->connection);
        $this->assertNull($job->queue);
    }

    public function test_hors_de_la_base_un_job_long_suit_la_connexion_par_defaut(): void
    {
        // La suite tourne en `sync` : elle doit continuer d'exécuter ces jobs sur place.
        config()->set('queue.default', 'sync');

        foreach (self::longJobs() as $classe => $creer) {
            $this->assertSame('sync', $creer()->connection, "{$classe} doit suivre la connexion sync");
        }
    }

    public function test_un_job_long_mis_en_file_atterrit_dans_la_file_long(): void
    {
        config()->set('queue.default', 'database');

        ExpirePendingBookingsJob::dispatch();

        $this->assertSame(['long'], DB::table('jobs')->pluck('queue')->all());
    }

    public function test_le_delai_de_reprise_de_la_connexion_longue_depasse_chaque_timeout(): void
    {
        $retryAfter = config('queue.connections.database-long.retry_after');

        foreach (self::longJobs() as $classe => $creer) {
            $this->assertGreaterThan($creer()->timeout + 5, $retryAfter, "{$classe} vit plus longtemps que retry_after");
        }
    }

    public function test_l_inventaire_des_jobs_longs_est_celui_du_code(): void
    {
        $derives = collect(File::allFiles(app_path('Jobs')))
            ->map(fn ($f) => 'App\\Jobs\\'.Str::of($f->getRelativePathname())->replace(['/', '.php'], ['\\', '']))
            ->filter(fn (string $classe) => class_exists($classe) && in_array(RunsOnLongQueue::class, class_uses_recursive($classe), true))
            ->sort()->values()->all();

        $ecrits = collect(array_keys(self::longJobs()))->sort()->values()->all();

        $this->assertSame($ecrits, $derives);
    }
}
