<?php

namespace Database\Factories;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ConversationFactory extends Factory
{
    protected $model = Conversation::class;

    public function definition(): array
    {
        return [
            'type' => ConversationType::Direct,
            'status' => ConversationStatus::Active,
            'subject' => fake()->sentence(4),
            'created_by' => User::factory(),
        ];
    }
}
