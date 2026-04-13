<?php

namespace Database\Seeders;

use App\Models\Agency;
use Illuminate\Database\Seeder;

class AgencySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create a primary test agency
        Agency::factory()->create([
            'name' => 'Takussan Immobilier',
            'slug' => 'takussan-immobilier',
            'email' => 'contact@takussan.sn',
            'license_number' => 'LIC-2026-001',
            'status' => 'active',
        ]);

        // Create some random agencies
        Agency::factory()->count(5)->create();
    }
}
