<?php

namespace Database\Seeders\System;

use App\Services\Geo\GeoReferentialSync;
use Illuminate\Database\Seeder;

/** TCK-633 — le référentiel géographique en développement : la même chose que `geo:sync-referential`. */
class GeoReferentialSeeder extends Seeder
{
    public function run(GeoReferentialSync $sync): void
    {
        $sync->executer(GeoReferentialSync::repertoireParDefaut());
    }
}
