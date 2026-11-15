<?php

namespace Database\Factories;

use App\Models\Conversation;
use App\Models\ConversationReport;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** TCK-2859 — un signalement de conversation. */
class ConversationReportFactory extends Factory
{
    protected $model = ConversationReport::class;

    public function definition(): array
    {
        return [
            'conversation_id' => Conversation::factory(),
            'reporter_id' => User::factory(),
            'reason' => 'spam',
            'comment' => null,
        ];
    }
}
