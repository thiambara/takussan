<?php

namespace App\Console\Commands;

use App\Services\Geo\GeoReferentialSync;
use Illuminate\Console\Command;
use RuntimeException;

/**
 * TCK-633 (ADR-0062 §3) — charge le référentiel géographique versionné. Idempotente : jouée à
 * chaque déploiement par `docker/release.sh`, parce que la production ne lance AUCUN seeder
 * (« Écarts relevés », E-2).
 */
class GeoSyncReferential extends Command
{
    protected $signature = 'geo:sync-referential {--dir= : répertoire des fichiers de région (défaut : database/data/geo/regions)}';

    protected $description = 'Charge le référentiel géographique versionné et rattache les adresses existantes (idempotent).';

    public function handle(GeoReferentialSync $sync): int
    {
        $repertoire = (string) ($this->option('dir') ?: GeoReferentialSync::repertoireParDefaut());

        try {
            $bilan = $sync->executer($repertoire);
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        foreach ($bilan as $cle => $valeur) {
            $this->line("{$cle} : {$valeur}");
        }

        return self::SUCCESS;
    }
}
