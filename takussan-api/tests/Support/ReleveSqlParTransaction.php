<?php

namespace Tests\Support;

use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Database\Events\TransactionRolledBack;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

/**
 * TCK-619 — relève le SQL réel avec le niveau de transaction ET l'identité de la transaction qui le porte.
 *
 * Le niveau seul (`DB::transactionLevel()`) ne distingue pas deux `DB::transaction` successives : un verrou
 * pris dans la première, relâché à son `COMMIT`, puis une écriture dans la seconde, se relèvent au même
 * niveau. L'identité, si : chaque `beganTransaction` (savepoint compris) ouvre une transaction numérotée,
 * chaque `committed` / `rolledBack` la referme. Ce qui s'exécute avant la première (la transaction de
 * `RefreshDatabase`) porte l'identité 0.
 *
 * @phpstan-type Releve array{sql: string, bindings: array<int, mixed>, level: int, tx: int}
 */
trait ReleveSqlParTransaction
{
    /**
     * @return \ArrayObject<int, array{sql: string, bindings: array<int, mixed>, level: int, tx: int}>
     */
    protected function releverSqlParTransaction(): \ArrayObject
    {
        $releve = new \ArrayObject;
        $pile = [0];
        $compteur = 0;

        Event::listen(TransactionBeginning::class, function () use (&$pile, &$compteur): void {
            $pile[] = ++$compteur;
        });
        $fermer = function () use (&$pile): void {
            if (count($pile) > 1) {
                array_pop($pile);
            }
        };
        Event::listen(TransactionCommitted::class, $fermer);
        Event::listen(TransactionRolledBack::class, $fermer);

        DB::listen(function (QueryExecuted $query) use ($releve, &$pile): void {
            $releve[] = [
                'sql' => $query->sql,
                'bindings' => $query->bindings,
                'level' => DB::transactionLevel(),
                'tx' => end($pile),
            ];
        });

        return $releve;
    }
}
