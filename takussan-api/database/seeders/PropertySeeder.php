<?php

namespace Database\Seeders;

use App\Models\Property;
use Illuminate\Database\Seeder;

class PropertySeeder extends Seeder
{
    public function run(): void
    {
        // 8 annonces publiées normales
        Property::factory()
            ->count(8)
            ->published()
            ->create();

        // 2 annonces publiées "à la une"
        Property::factory()
            ->count(2)
            ->published()
            ->create(['featured' => true]);
    }
}
