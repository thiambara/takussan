<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database with ~13 months of realistic activity.
     */
    public function run(): void
    {
        $this->call(YearOfActivitySeeder::class);
    }
}
