<?php

namespace Database\Factories;

use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class AppNotificationFactory extends Factory
{
    protected $model = AppNotification::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'type' => NotificationType::cases()[0]->value,
            'delivery_channel' => NotificationChannel::Sms->value,
            'title' => $this->faker->sentence(4),
            'body' => $this->faker->sentence(8),
            'data' => null,
        ];
    }
}
