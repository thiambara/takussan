<?php

namespace Database\Seeders;

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
        // Get users with admin or manager roles to assign properties to
        $adminAndManagerUsers = User::whereHas('assigned_roles', function ($query) {
            $query->whereIn('code', ['admin', 'manager']);
        })->get();

        if ($adminAndManagerUsers->isEmpty()) {
            // Fallback in case no admin/manager users exist
            $adminAndManagerUsers = User::take(2)->get();
        }

        // Create a variety of property types for each admin/manager
        foreach ($adminAndManagerUsers as $user) {
            // Create some luxury apartments
            Property::factory()
                ->count(2)
                ->for($user)
                ->create([
                    'type' => 'apartment',
                    'title' => fake()->randomElement(['Luxury Apartment', 'Modern Apartment', 'Penthouse Suite']),
                    'price' => fake()->numberBetween(200000, 500000),
                    'area' => fake()->numberBetween(80, 150),
                    'status' => 'available',
                    'contract_type' => 'sale',
                    'servicing' => ['water', 'electricity', 'internet', 'security'],
                ])
                ->each(function ($property) {
                    // Add an address for each property
                    $property->address()->create([
                        'street' => fake()->streetAddress(),
                        'city' => fake()->randomElement(['Dakar', 'Thiès', 'Saint-Louis']),
                        'state' => fake()->randomElement(['Dakar', 'Thiès', 'Saint-Louis']),
                        'country' => 'Senegal',
                        'address' => fake()->address(),
                        'postal_code' => fake()->postcode(),
                        'latitude' => fake()->latitude(),
                        'longitude' => fake()->longitude(),
                        'metadata' => json_encode(['is_primary' => true]),
                    ]);
                });

            // Create some houses for rent
            Property::factory()
                ->count(2)
                ->for($user)
                ->create([
                    'type' => 'house',
                    'title' => fake()->randomElement(['Family House', 'Traditional Home', 'Modern House']),
                    'price' => fake()->numberBetween(30000, 80000),
                    'area' => fake()->numberBetween(100, 250),
                    'status' => 'available',
                    'contract_type' => 'rent',
                    'servicing' => ['water', 'electricity'],
                ])
                ->each(function ($property) {
                    // Add an address for each property
                    $property->address()->create([
                        'street' => fake()->streetAddress(),
                        'city' => fake()->randomElement(['Dakar', 'Mbour', 'Saly']),
                        'state' => fake()->randomElement(['Dakar', 'Thiès', 'Saint-Louis']),
                        'country' => 'Senegal',
                        'address' => fake()->address(),
                        'latitude' => fake()->latitude(),
                        'longitude' => fake()->longitude(),
                        'metadata' => json_encode(['is_primary' => true]),
                    ]);
                });

            // Create some villas
            Property::factory()
                ->count(1)
                ->for($user)
                ->create([
                    'type' => 'villa',
                    'title' => fake()->randomElement(['Luxury Villa', 'Beach Villa', 'Executive Villa']),
                    'price' => fake()->numberBetween(500000, 1500000),
                    'area' => fake()->numberBetween(200, 500),
                    'status' => 'available',
                    'contract_type' => fake()->randomElement(['sale', 'rent']),
                    'servicing' => ['water', 'electricity', 'internet', 'security', 'cleaning'],
                ])
                ->each(function ($property) {
                    // Add an address for each property
                    $property->address()->create([
                        'street' => fake()->streetAddress(),
                        'city' => fake()->randomElement(['Saly', 'Mbour', 'Cap Skirring']),
                        'state' => fake()->randomElement(['Thiès', 'Ziguinchor']),
                        'country' => 'Senegal',
                        'address' => fake()->address(),
                        'latitude' => fake()->latitude(),
                        'longitude' => fake()->longitude(),
                        'metadata' => json_encode(['is_primary' => true]),
                    ]);
                });
        }

        // Create some properties with different statuses
        $statusOptions = ['sold', 'rented', 'under_maintenance', 'unavailable'];
        foreach ($statusOptions as $status) {
            Property::factory()
                ->count(1)
                ->for($adminAndManagerUsers->random())
                ->create([
                    'status' => $status,
                ])
                ->each(function ($property) {
                    // Add an address for each property
                    $property->address()->create([
                        'street' => fake()->streetAddress(),
                        'city' => fake()->city(),
                        'state' => fake()->state(),
                        'country' => 'Senegal',
                        'address' => fake()->address(),
                        'latitude' => fake()->latitude(),
                        'longitude' => fake()->longitude(),
                        'metadata' => json_encode(['is_primary' => true]),
                    ]);
                });
        }
    }
}
