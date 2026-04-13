<?php

namespace Database\Factories;

use App\Models\Notification;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Notification>
 */
class NotificationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $notificationTypes = ['system', 'booking', 'payment', 'property', 'user', 'message'];
        $deliveryChannels = ['app', 'email', 'sms', 'push'];
        
        $property = Property::inRandomOrder()->first();
        if (!$property) {
            $property = Property::factory()->create();
        }
        
        $isRead = fake()->boolean(30);
        $isActioned = fake()->boolean(20);
        $isDelivered = fake()->boolean(80);
        
        return [
            'user_id' => User::factory(),
            'type' => fake()->randomElement($notificationTypes),
            'title' => fake()->sentence(3),
            'content' => fake()->paragraph(2),
            'reference_id' => $property->id,
            'reference_type' => Property::class,
            'is_read' => $isRead,
            'read_at' => $isRead ? fake()->dateTimeBetween('-30 days', 'now') : null,
            'is_actioned' => $isActioned,
            'actioned_at' => $isActioned ? fake()->dateTimeBetween('-30 days', 'now') : null,
            'delivered' => $isDelivered,
            'delivery_channel' => fake()->randomElement($deliveryChannels),
            'delivered_at' => $isDelivered ? fake()->dateTimeBetween('-30 days', 'now') : null,
        ];
    }

    /**
     * Indicate that the notification has been read.
     */
    public function read(): Factory
    {
        return $this->state(function (array $attributes) {
            return [
                'is_read' => true,
                'read_at' => fake()->dateTimeBetween('-30 days', 'now'),
            ];
        });
    }

    /**
     * Indicate that the notification has been actioned.
     */
    public function actioned(): Factory
    {
        return $this->state(function (array $attributes) {
            return [
                'is_read' => true,
                'read_at' => fake()->dateTimeBetween('-30 days', 'now'),
                'is_actioned' => true,
                'actioned_at' => fake()->dateTimeBetween('-30 days', 'now'),
            ];
        });
    }

    /**
     * Indicate that the notification is unread.
     */
    public function unread(): Factory
    {
        return $this->state(function (array $attributes) {
            return [
                'is_read' => false,
                'read_at' => null,
            ];
        });
    }

    /**
     * Indicate that the notification is for a property.
     */
    public function forProperty(Property $property = null): Factory
    {
        if (!$property) {
            $property = Property::factory()->create();
        }
        
        return $this->state(function (array $attributes) use ($property) {
            return [
                'type' => 'property',
                'reference_id' => $property->id,
                'reference_type' => Property::class,
                'title' => 'Property Update: ' . $property->title,
                'content' => fake()->paragraph() . ' for property: ' . $property->title,
            ];
        });
    }
}
