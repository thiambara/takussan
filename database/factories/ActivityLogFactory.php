<?php

namespace Database\Factories;

use App\Models\ActivityLog;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ActivityLog>
 */
class ActivityLogFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $property = Property::inRandomOrder()->first();
        
        // If no property exists, create one
        if (!$property) {
            $property = Property::factory()->create();
        }
        
        $actionTypes = ['create', 'update', 'delete', 'view', 'login', 'logout', 'failed_login'];
        
        return [
            'user_id' => User::factory(),
            'loggable_id' => $property->id,
            'loggable_type' => Property::class,
            'action' => fake()->randomElement($actionTypes),
            'description' => fake()->sentence(),
            'changes' => fake()->optional()->randomElements(['title', 'description', 'price', 'status'], rand(0, 4)),
            'ip_address' => fake()->ipv4(),
            'user_agent' => fake()->userAgent(),
            'created_at' => fake()->dateTimeBetween('-30 days', 'now'),
        ];
    }

    /**
     * Indicate that the log is for a property.
     */
    public function forProperty(Property $property = null): Factory
    {
        if (!$property) {
            $property = Property::factory()->create();
        }
        
        return $this->state(function (array $attributes) use ($property) {
            return [
                'loggable_id' => $property->id,
                'loggable_type' => Property::class,
            ];
        });
    }

    /**
     * Indicate that the log is for a user.
     */
    public function forUser(User $targetUser = null): Factory
    {
        if (!$targetUser) {
            $targetUser = User::factory()->create();
        }
        
        return $this->state(function (array $attributes) use ($targetUser) {
            return [
                'loggable_id' => $targetUser->id,
                'loggable_type' => User::class,
            ];
        });
    }

    /**
     * Indicate that the log is for a login action.
     */
    public function forLogin(): Factory
    {
        return $this->state(function (array $attributes) {
            return [
                'action' => 'login',
                'description' => 'User logged in',
                'loggable_type' => User::class,
                'changes' => null,
            ];
        });
    }
}
