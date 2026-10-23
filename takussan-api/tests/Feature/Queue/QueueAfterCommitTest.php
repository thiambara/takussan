<?php

namespace Tests\Feature\Queue;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-746 (P05.05, P11.09) — une écriture annulée n'envoie rien : tout job, notification ou
 * écouteur mis en file dans une transaction n'entre dans la file qu'à son commit.
 *
 * Aujourd'hui la file `database` partage la connexion par défaut : sa ligne `jobs` est annulée
 * avec la transaction, et le défaut ne se voit pas. Une file Redis ou SQS, elle, recevrait le job
 * tout de suite. `after_commit => true` rend ce comportement indépendant du transport.
 *
 * TCK-1802 (P156.01) — la file `sync` de la suite porte aussi la clé : sans elle, un job mis en
 * file dans une transaction s'exécutait DEDANS, avant la ligne qui suit le dispatch, et son échec
 * annulait l'écriture qui le précédait. Ni le développement ni la préproduction (`database`) n'ont
 * cet ordre ni cette atomicité : la suite éprouvait un régime qu'aucun serveur ne tourne.
 */
class QueueAfterCommitTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Les connexions qui attendent le commit : celles qui écrivent vers un transport, et `sync`,
     * celle de la suite (TCK-1802). `deferred`, `background` et `failover` ne portent pas la clé.
     */
    private const TRANSPORTS = ['sync', 'database', 'beanstalkd', 'sqs', 'redis'];

    public function test_chaque_connexion_de_file_attend_le_commit(): void
    {
        foreach (config('queue.connections') as $name => $connection) {
            if (! in_array($connection['driver'] ?? null, self::TRANSPORTS, true)) {
                continue;
            }
            $this->assertTrue(
                $connection['after_commit'] ?? false,
                "queue.connections.{$name}.after_commit doit valoir true"
            );
        }
    }

    public function test_un_job_mis_en_file_dans_une_transaction_n_entre_dans_la_file_qu_au_commit(): void
    {
        config()->set('queue.default', 'database');

        DB::transaction(function () {
            JobDeTransaction::dispatch();
            $this->assertSame(0, DB::table('jobs')->count(), 'aucune ligne avant le commit');
        });

        $this->assertSame(1, DB::table('jobs')->count(), 'la ligne entre au commit');
    }

    public function test_une_transaction_annulee_ne_met_rien_en_file(): void
    {
        config()->set('queue.default', 'database');

        try {
            DB::transaction(function () {
                JobDeTransaction::dispatch();
                throw new \RuntimeException('annulée');
            });
        } catch (\RuntimeException) {
        }

        $this->assertSame(0, DB::table('jobs')->count());
    }

    public function test_sous_sync_un_job_mis_en_file_dans_une_transaction_s_execute_apres_le_commit(): void
    {
        config()->set('queue.default', 'sync');
        JobQuiTrace::$trace = [];

        DB::transaction(function () {
            JobQuiTrace::dispatch();
            JobQuiTrace::$trace[] = 'apres-dispatch';
        });

        // L'ordre du worker : le job ne voit la base qu'une fois l'écriture validée.
        $this->assertSame(['apres-dispatch', 'job'], JobQuiTrace::$trace);
    }

    public function test_sous_sync_l_echec_du_job_n_annule_pas_l_ecriture_validee(): void
    {
        config()->set('queue.default', 'sync');

        try {
            DB::transaction(function () {
                DB::table('jobs')->insert([
                    'queue' => 'ecriture-du-geste',
                    'payload' => '{}',
                    'attempts' => 0,
                    'available_at' => 0,
                    'created_at' => 0,
                ]);
                JobQuiEchoue::dispatch();
            });
            $this->fail('l\'échec du job remonte encore à l\'appelant sous `sync`');
        } catch (\RuntimeException $e) {
            $this->assertSame('échec du job', $e->getMessage());
        }

        // Au worker, le geste est validé et le job échoue après coup : la suite le joue de même.
        $this->assertSame(1, DB::table('jobs')->where('queue', 'ecriture-du-geste')->count());
    }

    public function test_hors_transaction_le_job_entre_aussitot(): void
    {
        config()->set('queue.default', 'database');

        JobDeTransaction::dispatch();

        $this->assertSame(1, DB::table('jobs')->count());
    }
}

class JobDeTransaction implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public function handle(): void {}
}

class JobQuiTrace implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /** @var list<string> */
    public static array $trace = [];

    public function handle(): void
    {
        self::$trace[] = 'job';
    }
}

class JobQuiEchoue implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public function handle(): void
    {
        throw new \RuntimeException('échec du job');
    }
}
