<?php

namespace Database\Seeders;

use App\Models\Bases\Enums\UserRole;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Seeder;

class PropertySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get users with admin or manager roles (Vendors)
        $vendors = User::role([UserRole::Admin->value, UserRole::Vendor->value])->with('agency')->get();

        if ($vendors->isEmpty()) {
            return;
        }

        // Create a variety of property types for each vendor
        foreach ($vendors as $user) {
            // Determine agency context
            $agencyId = $user->agency_id;

            // Create some luxury apartments
            Property::factory()
                ->count(rand(1, 3))
                ->for($user)
                ->create([
                    'type' => 'apartment',
                    'agency_id' => $agencyId,
                    'title' => fake()->randomElement(['Appartement de Luxe', 'Résidence Moderne', 'Penthouse Vue Mer']),
                    'price' => fake()->numberBetween(25000000, 150000000), // Prices in CFA roughly
                    'area' => fake()->numberBetween(80, 250),
                    'status' => 'available',
                    'contract_type' => 'sale',
                    'servicing' => ['water', 'electricity', 'internet', 'security', 'elevator'],
                ])
                ->each(function ($property) {
                    // Add an address using factory
                    $property->address()->save(\App\Models\Address::factory()->make());
                });

            // Create some houses/villas for rent
            Property::factory()
                ->count(rand(1, 3))
                ->for($user)
                ->create([
                    'type' => 'villa',
                    'agency_id' => $agencyId,
                    'title' => fake()->randomElement(['Villa Familiale', 'Maison de Ville', 'Villa avec Piscine']),
                    'price' => fake()->numberBetween(300000, 1500000), // Rent in CFA
                    'area' => fake()->numberBetween(150, 400),
                    'status' => 'available',
                    'contract_type' => 'rent',
                    'servicing' => ['water', 'electricity', 'pool', 'garden', 'security'],
                ])
                ->each(function ($property) {
                    $property->address()->save(\App\Models\Address::factory()->make());
                });
        }
    }
}
