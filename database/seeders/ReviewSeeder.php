<?php

namespace Database\Seeders;

use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

class ReviewSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get properties to add reviews for
        $properties = Property::all();

        if ($properties->isEmpty()) {
            // Create properties if none exist
            $properties = Property::factory()->count(5)->create();
        }

        // Get users who can create reviews
        $users = User::all();

        if ($users->isEmpty()) {
            $users = new Collection([User::factory()->create()]);
        }

        // Get admins who can approve reviews
        $admins = User::whereHas('assigned_roles', function ($query) {
            $query->where('code', 'admin')->orWhere('code', 'manager');
        })->get();

        if ($admins->isEmpty()) {
            $admins = new Collection([User::factory()->create()]);
        }

        // Create reviews for properties
        foreach ($properties as $property) {
            // Number of reviews per property (0-5)
            $reviewCount = rand(0, 5);

            for ($i = 0; $i < $reviewCount; $i++) {
                $isApproved = (rand(0, 100) > 20); // 80% chance to be approved

                Review::factory()->create([
                    'model_id' => $property->id,
                    'model_type' => Property::class,
                    'user_id' => $users->random()->id,
                    'is_approved' => $isApproved,
                    'approved_by' => $isApproved ? $admins->random()->id : null,
                    'approved_at' => $isApproved ? now()->subDays(rand(1, 30)) : null,
                ]);
            }
        }

        // Create some pending reviews
        Review::factory()
            ->count(3)
            ->state(['is_approved' => false]) // Use state instead of pending() method
            ->create([
                'model_id' => $properties->random()->id,
                'model_type' => Property::class,
                'user_id' => $users->random()->id,
            ]);
    }
}
