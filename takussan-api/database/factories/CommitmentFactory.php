<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\Enums\CommitmentStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** TCK-2969 — un engagement ouvert, dû dans trois jours. */
class CommitmentFactory extends Factory
{
    protected $model = Commitment::class;

    public function definition(): array
    {
        return [
            'conversation_id' => Conversation::factory(),
            'agency_id' => Agency::factory(),
            'holder_id' => User::factory(),
            'created_by_id' => fn (array $attributs) => $attributs['holder_id'],
            'title' => 'Repasser pour la fuite',
            'due_at' => now()->addDays(3),
            'status' => CommitmentStatus::Open,
        ];
    }
}
