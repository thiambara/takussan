<?php

use App\Services\Boost\LegacyFeaturedConversion;
use Database\Seeders\System\BoostProductSeeder;
use Illuminate\Database\Migrations\Migration;

/**
 * TCK-633 lot F (ADR-0061 §4, §5) — migration de DONNÉES : la production ne lance aucun seeder.
 * `down()` ne fait rien : les tables qu'elle remplit sont supprimées par le `down()` de `500100`.
 */
return new class extends Migration
{
    public function up(): void
    {
        (new BoostProductSeeder)->run();
        app(LegacyFeaturedConversion::class)->run();
    }

    public function down(): void
    {
        // Données seulement : rien à défaire que `500100` ne défasse.
    }
};
