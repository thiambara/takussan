<?php

namespace Tests\Feature\Audit;

use App\Jobs\Audit\ExportActivityLogJob;
use App\Models\User;
use Tests\TestCase;

/**
 * TCK-1414 (P78.01) — le job d'export du journal porte son propre délai.
 *
 * Sans `$timeout`, il hérite des 60 s par défaut de `queue:work` (le worker `default` tourne sans
 * `--timeout`) : un export de 20 000 lignes en XLSX, mesuré 64 s après le préchargement, y était
 * tué, rejoué, puis perdu sans courriel. Le délai reste sous `retry_after` des files de base et de
 * Redis : au-delà, une seconde copie du job démarrerait pendant que la première tourne encore.
 */
class ExportAuditDelaiDuJobTest extends TestCase
{
    public function test_le_job_depasse_le_delai_par_defaut_du_worker_et_reste_sous_retry_after(): void
    {
        $job = new ExportActivityLogJob(new User, ['format' => 'xlsx'], 1);

        $this->assertIsInt($job->timeout ?? null);
        $this->assertGreaterThan(60, $job->timeout);

        foreach (['database', 'redis'] as $connexion) {
            $this->assertLessThan(
                (int) config("queue.connections.{$connexion}.retry_after"),
                $job->timeout,
                "Le délai du job doit rester sous retry_after de la file {$connexion}.",
            );
        }
    }
}
