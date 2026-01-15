<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get admin and manager users to be assigned as customer creators
        $adminUsers = User::whereHas('assigned_roles', function ($query) {
            $query->where('code', 'admin');
        })->get();

        $managerUsers = User::whereHas('assigned_roles', function ($query) {
            $query->where('code', 'vendor');
        })->get();

        $userCreators = $adminUsers->merge($managerUsers);

        if ($userCreators->isEmpty()) {
            // Fallback if no specific users found, create one
            $userCreators = User::factory()->count(1)->create();
        }

        // Create active customers for each admin/manager
        foreach ($userCreators as $creator) {
            Customer::factory()
                ->count(3)
                ->active()
                ->create([
                    'added_by_id' => $creator->id,
                ]);

            // Create some inactive customers
            Customer::factory()
                ->count(1)
                ->inactive()
                ->create([
                    'added_by_id' => $creator->id,
                ]);
        }

        // Use first available admin or fallback to first creator
        $adminId = $adminUsers->first()?->id ?? $userCreators->first()->id;
        // Use first available manager or fallback to first creator
        $managerId = $managerUsers->first()?->id ?? $userCreators->first()->id;

        // Create specific VIP customers
        $specificCustomers = [
            [
                'first_name' => 'Amadou',
                'last_name' => 'Diallo',
                'email' => 'amadou.diallo@example.com',
                'phone' => '+221 77 123 45 67',
                'status' => 'active',
                'birth_date' => '1982-06-15',
                'added_by_id' => $adminId,
                'metadata' => [
                    'address' => 'Dakar, Almadies, Sénégal',
                    'notes' => 'Client VIP - Intéressé par des propriétés de luxe',
                    'preferred_locations' => ['Dakar', 'Saint-Louis'],
                    'budget_range' => '300000-1000000'
                ],
            ],
            [
                'first_name' => 'Fatou',
                'last_name' => 'Ndiaye',
                'email' => 'fatou.ndiaye@example.com',
                'phone' => '+221 77 234 56 78',
                'status' => 'active',
                'birth_date' => '1990-03-22',
                'added_by_id' => $adminId,
                'metadata' => [
                    'address' => 'Thiès, Sénégal',
                    'notes' => 'Client régulier - Recherche location à long terme',
                    'preferred_locations' => ['Dakar', 'Thiès'],
                    'budget_range' => '50000-150000'
                ],
            ],
            [
                'first_name' => 'Omar',
                'last_name' => 'Sow',
                'email' => 'omar.sow@example.com',
                'phone' => '+221 76 345 67 89',
                'status' => 'active',
                'birth_date' => '1975-11-08',
                'added_by_id' => $managerId,
                'metadata' => [
                    'address' => 'Mbour, Sénégal',
                    'notes' => 'Investisseur - Intéressé par terrains et propriétés à vendre',
                    'preferred_locations' => ['Mbour', 'Saly'],
                    'budget_range' => '500000-2000000'
                ],
            ],
        ];

        foreach ($specificCustomers as $customerData) {
            Customer::create($customerData);
        }

        // Add addresses for some customers
        Customer::take(5)->get()->each(function ($customer) {
            $customer->addresses()->create([
                'street' => fake()->streetAddress(),
                'city' => fake()->randomElement(['Dakar', 'Thiès', 'Saint-Louis', 'Mbour']),
                'state' => fake()->randomElement(['Dakar', 'Thiès', 'Saint-Louis']),
                'country' => 'Senegal',
                'address' => fake()->address(),
                'metadata' => json_encode(['is_primary' => true]),
            ]);
        });
    }
}
