<?php

namespace Tests\Feature\Queue;

use App\Jobs\Concerns\RunsOnAiQueue;
use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\MaintenanceRequest;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-2402 (ADR-0078, amendement) — les jobs qui appellent le modèle hors d'une requête HTTP passent
 * par la file `ai`, servie par le seul `worker-ia` : une extraction en cours ou une rafale d'annonces
 * ne retient plus une notification urgente.
 *
 * La liste est écrite ici ET dérivée du code : un job qui prend le trait sans y figurer, ou qui y
 * figure sans le prendre, fait rougir le test d'inventaire.
 */
class AiJobsQueueTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<class-string, callable(): object> */
    private static function aiJobs(): array
    {
        return [
            ExtractRadarListing::class => fn () => new ExtractRadarListing(1),
            VerifyRadarConsentReply::class => fn () => new VerifyRadarConsentReply(1),
        ];
    }

    public function test_chaque_job_d_appel_ia_vise_la_file_ai_quand_la_file_est_en_base(): void
    {
        config()->set('queue.default', 'database');

        foreach (self::aiJobs() as $classe => $creer) {
            $job = $creer();
            $this->assertSame('ai', $job->queue, "{$classe} doit viser la file ai");
            // Même connexion que `notifications-urgent` et `default` : `ai` n'a pas de connexion à elle,
            // son délai de reprise (90 s) couvre les 85 s de `$timeout` (check-queues.mjs).
            $this->assertNull($job->connection, "{$classe} garde la connexion par défaut");
        }
    }

    public function test_un_job_d_appel_ia_mis_en_file_n_atterrit_ni_sur_default_ni_sur_les_notifications(): void
    {
        config()->set('queue.default', 'database');

        ExtractRadarListing::dispatch(1);
        VerifyRadarConsentReply::dispatch(1);

        $files = DB::table('jobs')->pluck('queue')->all();
        $this->assertSame(['ai', 'ai'], $files);
        $this->assertNotContains('default', $files);
        $this->assertNotContains('notifications-urgent', $files);
    }

    public function test_sous_la_suite_les_jobs_ia_restent_synchrones(): void
    {
        // phpunit.xml pose QUEUE_CONNECTION=sync : aucune clé de plus, la connexion n'est jamais forcée.
        $this->assertSame('sync', config('queue.default'));

        foreach (self::aiJobs() as $classe => $creer) {
            $this->assertNull($creer()->connection, "{$classe} ne force aucune connexion");
        }
    }

    public function test_un_job_de_notification_reste_sur_la_file_des_notifications_urgentes(): void
    {
        config()->set('queue.default', 'database');

        $notification = new UrgentMaintenanceCreatedNotification(MaintenanceRequest::factory()->create());

        $this->assertSame('notifications-urgent', $notification->queue);
        $this->assertNotContains('ai', [$notification->queue]);
    }

    public function test_le_delai_de_reprise_de_la_connexion_couvre_chaque_timeout_des_jobs_ia(): void
    {
        $retryAfter = config('queue.connections.database.retry_after');

        foreach (self::aiJobs() as $classe => $creer) {
            // La marge de 5 s est celle de `check-queues.mjs` : `$timeout + 5 <= retry_after`.
            $this->assertLessThanOrEqual($retryAfter, $creer()->timeout + 5, "{$classe} vit plus longtemps que retry_after");
        }
    }

    public function test_l_inventaire_des_jobs_ia_est_celui_du_code(): void
    {
        $derives = collect(File::allFiles(app_path('Jobs')))
            ->map(fn ($f) => 'App\\Jobs\\'.Str::of($f->getRelativePathname())->replace(['/', '.php'], ['\\', '']))
            ->filter(fn (string $classe) => class_exists($classe) && in_array(RunsOnAiQueue::class, class_uses_recursive($classe), true))
            ->sort()->values()->all();

        $ecrits = collect(array_keys(self::aiJobs()))->sort()->values()->all();

        $this->assertSame($ecrits, $derives);
    }
}
