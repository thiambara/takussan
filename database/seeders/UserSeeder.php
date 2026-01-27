<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Bases\Enums\UserRole;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run(): void
    {
        // Get roles
        $adminRole = Role::where('name', UserRole::Admin->value)->first();
        $managerRole = Role::where('name', UserRole::Vendor->value)->first();
        $customerRole = Role::where('name', UserRole::Customer->value)->first();

        // Get main agency
        $mainAgency = Agency::where('slug', 'takussan-immobilier')->first();

        // Create admin user
        $admin = User::factory()->create([
            'first_name' => 'Admin',
            'last_name' => 'Takussan',
            'email' => 'admin@takussan.com',
            'username' => 'admin',
            'password' => bcrypt('Admin123!'),
            'status' => 'active',
            'agency_id' => $mainAgency?->id, // Admin belongs to main agency
        ]);
        $admin->assignRole($adminRole);

        // Create manager user
        $manager = User::factory()->create([
            'first_name' => 'Manager',
            'last_name' => 'Immo',
            'email' => 'manager@takussan.com',
            'username' => 'manager',
            'password' => bcrypt('Manager123!'),
            'status' => 'active',
            'agency_id' => $mainAgency?->id,
        ]);
        $manager->assignRole($managerRole);

        // Create customer user
        $regularUser = User::factory()->create([
            'first_name' => 'Jean',
            'last_name' => 'Client',
            'email' => 'user@takussan.com',
            'username' => 'user',
            'password' => bcrypt('User123!'),
            'status' => 'active',
        ]);

        $regularUser->assignRole($customerRole);

        // Create Agents for other agencies
        $otherAgencies = Agency::where('id', '!=', $mainAgency?->id)->get();

        foreach ($otherAgencies as $agency) {
            User::factory()
                ->count(2)
                ->create([
                    'agency_id' => $agency->id,
                    'status' => 'active'
                ])
                ->each(function ($user) use ($managerRole) {
                    $user->assignRole($managerRole);
                });
        }

        // Create some independent users/customers
        User::factory()
            ->count(5)
            ->create()
            ->each(function ($user) use ($customerRole) {
                $user->assignRole($customerRole);
            });

        // Create customers with one-to-one relationship to some users
        // Create a customer for the regular user (demonstrating one-to-one relationship)
        Customer::create([
            'first_name' => 'John',
            'last_name' => 'Customer',
            'email' => 'john.customer@example.com',
            'phone' => '+1234567890',
            'birth_date' => '1990-05-15',
            'status' => 'active',
            'user_id' => $regularUser->id, // One-to-one relationship
            'added_by_id' => $admin->id,
        ]);

        // Create another customer for the manager
        Customer::create([
            'first_name' => 'Jane',
            'last_name' => 'Smith',
            'email' => 'jane.smith@example.com',
            'phone' => '+0987654321',
            'birth_date' => '1985-08-20',
            'status' => 'active',
            'user_id' => $manager->id, // One-to-one relationship
            'added_by_id' => $admin->id,
        ]);

        // Create some customers without linked users (showing optional relationship)
        Customer::factory()
            ->count(3)
            ->create([
                'added_by_id' => $admin->id,
                'user_id' => null, // No linked user
            ]);
    }
}
