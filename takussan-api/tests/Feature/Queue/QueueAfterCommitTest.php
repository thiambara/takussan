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
 */
class QueueAfterCommitTest extends TestCase
{
    use RefreshDatabase;

    /** Les connexions qui écrivent vers un transport : `sync`, `deferred`, `background` n'en ont pas. */
    private const TRANSPORTS = ['database', 'beanstalkd', 'sqs', 'redis'];

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
