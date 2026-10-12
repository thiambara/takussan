<?php

namespace Database\Seeders\System;

use App\Services\Boost\LegacyFeaturedConversion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** TCK-633 lot F — après le jeu de démonstration : `ranked_at` rattrapé, vedettes converties en Vedettes offertes. */
class OfferedFeaturedSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('properties')->whereNull('ranked_at')->whereNotNull('published_at')->update(['ranked_at' => DB::raw('published_at')]);
        app(LegacyFeaturedConversion::class)->run();
    }
}
