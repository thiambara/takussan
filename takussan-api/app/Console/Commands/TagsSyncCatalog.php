<?php

namespace App\Console\Commands;

use App\Services\Tags\TagCatalog;
use Illuminate\Console\Command;

/** TCK-633 (ADR-0062 §7) — joué par `docker/release.sh` à chaque déploiement. Idempotent. */
class TagsSyncCatalog extends Command
{
    protected $signature = 'tags:sync-catalog';

    protected $description = 'Charge le catalogue versionné des équipements et des étiquettes CRM (idempotent).';

    public function handle(TagCatalog $catalogue): int
    {
        $catalogue->synchroniser();
        $this->info('Catalogue des étiquettes synchronisé.');

        return self::SUCCESS;
    }
}
