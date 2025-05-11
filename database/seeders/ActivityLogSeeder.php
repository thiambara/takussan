<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Seeder;

class ActivityLogSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get users to log activities for
        $users = User::all();
        
        if ($users->isEmpty()) {
            $users = [User::factory()->create()];
        }
        
        // Get properties to log activities for
        $properties = Property::all();
        
        if ($properties->isEmpty()) {
            $properties = [Property::factory()->create()];
        }
        
        // Create login logs for users
        foreach ($users as $user) {
            // Random login count between 1-5 per user
            $loginCount = rand(1, 5);
            
            for ($i = 0; $i < $loginCount; $i++) {
                ActivityLog::factory()->create([
                    'user_id' => $user->id,
                    'loggable_id' => $user->id,
                    'loggable_type' => User::class,
                    'action' => 'login',
                    'description' => 'User logged in',
                    'changes' => null,
                    'created_at' => fake()->dateTimeBetween('-7 days', 'now'),
                ]);
            }
        }
        
        // Create property activity logs
        foreach ($properties as $property) {
            // Log creation
            ActivityLog::factory()->create([
                'user_id' => $property->user_id,
                'loggable_id' => $property->id,
                'loggable_type' => Property::class,
                'action' => 'create',
                'description' => 'Created property: ' . $property->title,
                'changes' => null,
                'created_at' => $property->created_at,
            ]);
            
            // Random update count between 0-3 per property
            $updateCount = rand(0, 3);
            
            for ($i = 0; $i < $updateCount; $i++) {
                $changes = [];
                $fields = ['title', 'description', 'price', 'status'];
                $selectedFields = array_rand(array_flip($fields), rand(1, count($fields)));
                
                foreach ((array) $selectedFields as $field) {
                    $changes[$field] = [
                        'old' => $field === 'price' ? fake()->numberBetween(50000, 2000000) : fake()->word(),
                        'new' => $property->{$field},
                    ];
                }
                
                ActivityLog::factory()->create([
                    'user_id' => $users->random()->id,
                    'loggable_id' => $property->id,
                    'loggable_type' => Property::class,
                    'action' => 'update',
                    'description' => 'Updated property: ' . $property->title,
                    'changes' => $changes,
                    'created_at' => fake()->dateTimeBetween($property->created_at, 'now'),
                ]);
            }
        }
        
        // Create some general system logs
        $systemActions = ['system_backup', 'system_update', 'error'];
        
        foreach ($systemActions as $action) {
            ActivityLog::factory()->create([
                'user_id' => $users->random()->id,
                'loggable_id' => null,
                'loggable_type' => 'System',
                'action' => $action,
                'description' => 'System ' . str_replace('_', ' ', $action) . ' event',
                'changes' => null,
                'created_at' => fake()->dateTimeBetween('-30 days', 'now'),
            ]);
        }
    }
}
