<?php

namespace App\Console\Commands;

use App\Support\Search\ReglagesDIndex;
use Illuminate\Console\Command;
use Meilisearch\Client;
use Meilisearch\Endpoints\Indexes;
use Meilisearch\Exceptions\ApiException;
use RuntimeException;
use Throwable;

/**
 * TCK-995 (P52.01, P52.02, P52.04) — remplace `scout:sync-index-settings` au déploiement
 * (`docker/release.sh`), dans `dev.sh` et dans la suite.
 *
 * La commande de Scout (11.3) attrape toute exception, l'imprime et sort en 0 : l'arrêt du
 * déploiement de TCK-710 ne se déclenchait jamais, et le premier refus abandonnait les index
 * suivants. Celle-ci, index par index :
 *
 *  1. envoie le déclaré, plus `null` pour tout réglage que l'index porte et que la configuration ne
 *     déclare plus (remis à son défaut, cf. {@see ReglagesDIndex::aEnvoyer()}) ;
 *  2. ATTEND la tâche : Meilisearch applique les réglages en asynchrone, et un rejet n'apparaît
 *     que dans la tâche ;
 *  3. RELIT les réglages et les compare au déclaré.
 *
 * Un index en échec n'arrête pas les suivants ; la commande sort en 1 si un seul a échoué.
 */
class SearchSyncIndexSettings extends Command
{
    protected $signature = 'search:sync-index-settings
        {--attente=120 : secondes d\'attente de la tâche de chaque index}';

    protected $description = 'Applique les réglages d\'index de config/scout.php, attend leurs tâches et les relit (échoue sur tout refus).';

    public function handle(): int
    {
        if (config('scout.driver') !== 'meilisearch') {
            $this->error('SCOUT_DRIVER n\'est pas meilisearch : aucun réglage d\'index à appliquer.');

            return self::FAILURE;
        }

        $client = app(Client::class);
        $attenteMs = max(1, (int) $this->option('attente')) * 1000;
        $echecs = 0;

        foreach (ReglagesDIndex::declares() as $uid => ['reglages' => $reglages]) {
            try {
                $index = $client->index($uid);
                $tache = $index->updateSettings(ReglagesDIndex::aEnvoyer($reglages, self::courants($index)));
                $fin = $client->waitForTask($tache['taskUid'], $attenteMs);

                if (($fin['status'] ?? null) !== 'succeeded') {
                    throw new RuntimeException(sprintf(
                        'tâche %s rendue « %s » : %s',
                        $tache['taskUid'],
                        $fin['status'] ?? '?',
                        $fin['error']['message'] ?? 'sans message',
                    ));
                }

                $ecarts = ReglagesDIndex::ecarts($reglages, $index->getSettings());

                if ($ecarts !== []) {
                    throw new RuntimeException('réglages relus différents de config/scout.php — '.implode(' ; ', $ecarts));
                }

                $this->info("[{$uid}] réglages appliqués et relus.");
            } catch (Throwable $e) {
                $echecs++;
                $this->error("[{$uid}] {$e->getMessage()}");
            }
        }

        return $echecs === 0 ? self::SUCCESS : self::FAILURE;
    }

    /** Les réglages de l'index, ou `[]` s'il n'existe pas encore : la mise à jour le crée. */
    private static function courants(Indexes $index): array
    {
        try {
            return $index->getSettings();
        } catch (ApiException $e) {
            if ($e->httpStatus === 404) {
                return [];
            }

            throw $e;
        }
    }
}
