<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

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
        $adminRole = Role::where('code', 'admin')->first();
        $managerRole = Role::where('code', 'manager')->first();
        $userRole = Role::where('code', 'user')->first();

        // Create admin user
        $admin = User::factory()->create([
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'admin@takussan.com',
            'username' => 'admin',
            'password' => bcrypt('Admin123!'),
            'status' => 'active',
        ]);
        $admin->assignRoles([$adminRole->id]);

        // Create manager user
        $manager = User::factory()->create([
            'first_name' => 'Property',
            'last_name' => 'Manager',
            'email' => 'manager@takussan.com',
            'username' => 'manager',
            'password' => bcrypt('Manager123!'),
            'status' => 'active',
        ]);
        $manager->assignRoles([$managerRole->id]);

        // Create regular user
        $regularUser = User::factory()->create([
            'first_name' => 'Regular',
            'last_name' => 'User',
            'email' => 'user@takussan.com',
            'username' => 'user',
            'password' => bcrypt('User123!'),
            'status' => 'active',
        ]);
        $regularUser->assignRoles([$userRole->id]);

        // Create some additional users with random roles
        User::factory()
            ->count(7)
            ->create()
            ->each(function ($user) use ($adminRole, $managerRole, $userRole) {
                $role = fake()->randomElement([$adminRole, $managerRole, $userRole]);
                $user->assignRoles([$role->id]);
            });
    }
}
