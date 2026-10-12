<?php

namespace Database\Seeders;

use Database\Seeders\System\BoostProductSeeder;
use Database\Seeders\System\OfferedFeaturedSeeder;
use Database\Seeders\System\PlanSeeder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database with ~13 months of realistic activity.
     */
    public function run(): void
    {
        $this->pruneOrphanMediaIfFresh();

        $this->call(PlanSeeder::class);
        $this->call(YearOfActivitySeeder::class);
        // TCK-633 lot F — le catalogue (déjà posé par la migration 500400, idempotent), puis les
        // vedettes du jeu de démonstration converties en Vedettes offertes.
        $this->call(BoostProductSeeder::class);
        $this->call(OfferedFeaturedSeeder::class);
    }

    /**
     * When the `media` table is empty (post `migrate:fresh`), wipe orphaned
     * Spatie media folders under `storage/app/public/` so disk usage doesn't
     * grow with each reseed. The seed image cache lives in a sibling folder
     * (`storage/app/seed-media-cache/`) and is preserved.
     */
    private function pruneOrphanMediaIfFresh(): void
    {
        if (! Schema::hasTable('media') || DB::table('media')->count() > 0) {
            return;
        }

        $mediaDisk = storage_path('app/public');
        if (! is_dir($mediaDisk)) {
            return;
        }

        foreach (File::directories($mediaDisk) as $dir) {
            File::deleteDirectory($dir);
        }
    }
}
