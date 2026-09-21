<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Jobs\Media\RegeneratePhotoConversionsJob;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-539, cinquième passe adverse (V5-1) — le délai d'un job de régénération est STRICTEMENT
 * inférieur au `retry_after` de chaque connexion qui en déclare un.
 *
 * Sans délai propre, c'est celui du worker qui s'applique (60 s) : le processus est tué, puis
 * `failed()` est appelé au dernier essai sans que `handle()` ait fini. Avec un délai supérieur au
 * `retry_after`, la file redonne le job à un second worker pendant que le premier tourne encore.
 * Les deux valeurs vivent dans deux fichiers : ce test les relit ensemble.
 */
class RegenerationTimeoutTest extends TestCase
{
    /** @return array<string, array{class-string}> */
    public static function jobs(): array
    {
        return [
            'RegenerateAgencyWatermarksJob' => [RegenerateAgencyWatermarksJob::class],
            'RegeneratePhotoConversionsJob' => [RegeneratePhotoConversionsJob::class],
        ];
    }

    #[DataProvider('jobs')]
    public function test_job_timeout_is_below_the_retry_after_of_every_queue_connection(string $class): void
    {
        $job = new $class(1);
        $this->assertIsInt($job->timeout ?? null, 'Un délai propre : sans lui, le délai du worker (60 s) s\'applique.');

        $retryAfters = collect(config('queue.connections'))
            ->filter(fn (array $connection) => isset($connection['retry_after']))
            ->map(fn (array $connection) => (int) $connection['retry_after']);

        // `database` est la connexion des environnements déployés (docs/infra/prod-drivers.json).
        $this->assertArrayHasKey('database', $retryAfters->all(), 'Précondition : la connexion déployée déclare un retry_after.');

        foreach ($retryAfters as $name => $retryAfter) {
            $this->assertLessThan($retryAfter, $job->timeout, "`{$name}` : retry_after={$retryAfter} s, timeout={$job->timeout} s.");
        }
    }
}
