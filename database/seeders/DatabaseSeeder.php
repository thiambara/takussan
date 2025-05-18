<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Create roles and permissions first
        $this->call(RolesAndPermissionsSeeder::class);
        
        // Create users with roles
        $this->call(UserSeeder::class);
        
        // Create customers
        $this->call(CustomerSeeder::class);
        
        // Create properties and addresses
        $this->call(PropertySeeder::class);
        
        // Create tags
        $this->call(TagSeeder::class);
        
        // Create bookings and payments
        $this->call(BookingSeeder::class);
        $this->call(BookingPaymentSeeder::class);
        
        // Create reviews
        $this->call(ReviewSeeder::class);
        
        // Create notifications
        $this->call(NotificationSeeder::class);
        
        // Activity logs
        $this->call(ActivityLogSeeder::class);
    }
}
