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
        // Get some users to assign properties to
        $users = User::whereHas('assigned_roles', function ($query) {
            $query->where('name', 'agent')->orWhere('name', 'admin');
        })->get();

        if ($users->isEmpty()) {
            $users = [User::factory()->create()];
        }

        // Create properties for each user
        foreach ($users as $user) {
            Property::factory()
                ->count(3)
                ->for($user)
                ->create()
                ->each(function ($property) {
                    // Add an address for each property
                    $property->address()->create([
                        'street' => fake()->streetAddress(),
                        'city' => fake()->city(),
                        'state' => fake()->state(),
                        'postal_code' => fake()->postcode(),
                        'country' => 'Senegal',
                        'is_primary' => true,
                    ]);
                });
        }

        // Create some properties for sale
        Property::factory()
            ->count(5)
            ->forSale()
            ->for($users->random())
            ->create();

        // Create some properties for rent
        Property::factory()
            ->count(5)
            ->forRent()
            ->for($users->random())
            ->create();
    }
}
