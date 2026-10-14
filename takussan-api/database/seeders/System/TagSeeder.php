<?php

namespace Database\Seeders\System;

use App\Services\Tags\TagCatalog;
use Illuminate\Database\Seeder;

/**
 * TCK-633 — le catalogue ne vit plus ici mais dans `TagCatalog`, que le déploiement charge aussi
 * (`tags:sync-catalog`). Une liste dans le seeder et une autre au déploiement divergeraient.
 */
class TagSeeder extends Seeder
{
    public function run(): void
    {
        app(TagCatalog::class)->synchroniser();
    }
}
