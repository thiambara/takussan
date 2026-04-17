<?php

namespace Database\Factories;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class MessageFactory extends Factory
{
    protected $model = Message::class;

    public function definition(): array
    {
        return [
            'conversation_id' => Conversation::factory(),
            'sender_id' => User::factory(),
            'type' => MessageType::Text,
            'content' => fake()->sentence(),
        ];
    }
}
