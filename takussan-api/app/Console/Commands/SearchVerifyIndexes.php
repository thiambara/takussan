<?php

namespace App\Console\Commands;

use App\Support\Search\ReglagesDIndex;
use DateTimeImmutable;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Meilisearch\Client;
use Meilisearch\Contracts\TasksQuery;
use Meilisearch\Exceptions\ApiException;
use Throwable;

/**
 * TCK-995 (P52.02, P52.03) — l'état réel des index déclarés, lu par `docker/release.sh`.
 *
 * Attend d'abord que la file de ces index soit vide, puis :
 *
 *  - `--documents` : échoue si un index est vide ou absent face à une table non vide. Le marqueur
 *    de la dernière importation vit dans le volume `storage` de l'API, les index dans le volume
 *    `meili` : une perte de Meilisearch laissait le marqueur dire « à jour », et la recherche
 *    rendait zéro résultat sans erreur (P52.03).
 *  - `--depuis=<horodatage ISO 8601>` : échoue si une tâche de ces index a échoué depuis.
 *    `scout:import` rend la main quand les documents sont MIS EN FILE ; un document refusé ne se
 *    voit que dans sa tâche (P52.02).
 *
 * Une table dont aucune ligne n'est indexable (des biens tous privés) passe pour non vide : le
 * déploiement réimporte alors à chaque fois, ce qui ne coûte qu'une importation vide.
 */
class SearchVerifyIndexes extends Command
{
    protected $signature = 'search:verify-indexes
        {--documents : échoue si un index est vide face à une table non vide}
        {--depuis= : échoue si une tâche de ces index a échoué depuis cet horodatage (ISO 8601)}
        {--attente=600 : secondes d\'attente de la file des index}';

    protected $description = 'Vérifie que les index déclarés sont peuplés et que leurs tâches récentes ont réussi.';

    public function handle(): int
    {
        if (config('scout.driver') !== 'meilisearch') {
            $this->error('SCOUT_DRIVER n\'est pas meilisearch : aucun index à vérifier.');

            return self::FAILURE;
        }

        $depuis = $this->option('depuis');

        if (! $this->option('documents') && ($depuis === null || $depuis === '')) {
            $this->error('Rien à vérifier : passer --documents, --depuis=<horodatage>, ou les deux.');

            return self::FAILURE;
        }

        $client = app(Client::class);
        $declares = ReglagesDIndex::declares();
        $uids = array_keys($declares);
        $echecs = 0;

        try {
            $this->attendreLaFile($client, $uids, max(1, (int) $this->option('attente')));

            if ($depuis !== null && $depuis !== '') {
                $echecs += $this->tachesEchouees($client, $uids, new DateTimeImmutable($depuis));
            }
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        if ($this->option('documents')) {
            foreach ($declares as $uid => ['modele' => $modele]) {
                if ($modele !== null) {
                    $echecs += $this->indexVide($client, $uid, $modele);
                }
            }
        }

        return $echecs === 0 ? self::SUCCESS : self::FAILURE;
    }

    /** @param  list<string>  $uids */
    private function attendreLaFile(Client $client, array $uids, int $secondes): void
    {
        $limite = microtime(true) + $secondes;
        $enAttente = (new TasksQuery)->setStatuses(['enqueued', 'processing'])->setIndexUids($uids)->setLimit(1);

        while ($client->getTasks($enAttente)->getTotal() > 0) {
            if (microtime(true) > $limite) {
                throw new \RuntimeException("la file de ces index ne s'est pas vidée en {$secondes} s.");
            }

            usleep(200_000);
        }
    }

    /** @param  list<string>  $uids */
    private function tachesEchouees(Client $client, array $uids, DateTimeImmutable $depuis): int
    {
        $echouees = $client->getTasks(
            (new TasksQuery)->setStatuses(['failed'])->setIndexUids($uids)->setAfterEnqueuedAt($depuis)->setLimit(20)
        );

        foreach ($echouees->getResults() as $tache) {
            $this->error(sprintf(
                '[%s] tâche %s (%s) échouée : %s',
                $tache['indexUid'] ?? '?',
                $tache['uid'] ?? '?',
                $tache['type'] ?? '?',
                $tache['error']['message'] ?? 'sans message',
            ));
        }

        return $echouees->getTotal();
    }

    /** @param  class-string<Model>  $modele */
    private function indexVide(Client $client, string $uid, string $modele): int
    {
        $lignes = $modele::query()->count();

        if ($lignes === 0) {
            return 0;
        }

        try {
            $documents = (int) ($client->index($uid)->stats()['numberOfDocuments'] ?? 0);
        } catch (ApiException $e) {
            if ($e->httpStatus !== 404) {
                throw $e;
            }
            $documents = 0;
        }

        if ($documents > 0) {
            return 0;
        }

        $this->error("[{$uid}] index vide ou absent face à {$lignes} ligne(s) de {$modele}.");

        return 1;
    }
}
