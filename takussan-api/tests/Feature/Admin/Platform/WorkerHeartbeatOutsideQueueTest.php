<?php

namespace Tests\Feature\Admin\Platform;

use App\Jobs\RecordQueueHeartbeat;
use App\Services\Admin\HealthcheckService;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\Looping;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

/**
 * TCK-934 (P43.03) — la vie d'un worker se mesure HORS de la file qu'il consomme.
 *
 * Le battement était un job ordinaire, mis en file chaque minute sur la file surveillée : derrière
 * un arriéré (3 531 conversions en file `media` mesurées sur la base de développement), il
 * attendait son tour, et la sonde `workers` déclarait `failed` à 300 s un worker qui travaillait.
 * `worker-media` consomme `media,reconciliation` par priorité : le battement de `reconciliation`
 * attendait tout l'arriéré de `media`.
 */
class WorkerHeartbeatOutsideQueueTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('public');
        config(['media-library.public_disk_name' => 'public', 'media-library.disk_name' => 'local']);

        foreach (RecordQueueHeartbeat::QUEUES as $file) {
            Cache::put(RecordQueueHeartbeat::cacheKey($file), now()->subSeconds(400)->getTimestamp());
        }
    }

    public function test_un_arriere_devant_le_battement_ne_fait_pas_declarer_failed_un_worker_actif(): void
    {
        // L'arriéré : 50 conversions disponibles depuis 400 s, et aucun battement depuis.
        $disponible = now()->subSeconds(400)->getTimestamp();
        DB::table('jobs')->insert(array_map(fn () => [
            'queue' => 'media',
            'payload' => '{}',
            'attempts' => 0,
            'reserved_at' => null,
            'available_at' => $disponible,
            'created_at' => $disponible,
        ], range(1, 50)));

        // Le worker de `compose.api.yml` dépile un job de l'arriéré.
        event(new JobProcessed('database', $this->job('media')));

        $workers = $this->sonder()['workers'];
        $this->assertSame('ok', $workers['queues']['media']['status']);
        $this->assertSame('failed', $workers['queues']['default']['status'], 'Un worker de `media` ne fait pas vivre `default`.');
    }

    public function test_chaque_tour_de_boucle_fait_battre_toutes_les_files_du_worker(): void
    {
        event(new Looping('database', 'media,reconciliation'));

        $workers = $this->sonder()['workers'];
        $this->assertSame('ok', $workers['queues']['media']['status']);
        $this->assertSame('ok', $workers['queues']['reconciliation']['status']);
        $this->assertSame('failed', $workers['queues']['notifications-urgent']['status']);
    }

    public function test_une_execution_synchrone_n_est_pas_un_worker(): void
    {
        event(new JobProcessed('sync', $this->job('media')));
        event(new Looping('sync', 'default'));

        $workers = $this->sonder()['workers'];
        $this->assertSame('failed', $workers['queues']['media']['status']);
        $this->assertSame('failed', $workers['queues']['default']['status']);
    }

    public function test_une_file_non_surveillee_n_ecrit_rien(): void
    {
        event(new Looping('database', 'autre'));

        $this->assertNull(Cache::get(RecordQueueHeartbeat::cacheKey('autre')));
    }

    private function job(string $queue): Job
    {
        $job = Mockery::mock(Job::class);
        $job->shouldReceive('getQueue')->andReturn($queue);

        return $job;
    }

    private function sonder(): array
    {
        return app(HealthcheckService::class)->refresh();
    }
}
