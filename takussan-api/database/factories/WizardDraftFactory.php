<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\WizardDraft;
use Illuminate\Database\Eloquent\Factories\Factory;

class WizardDraftFactory extends Factory
{
    protected $model = WizardDraft::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'key' => 'host-individual-wizard',
            'step' => 0,
            'data' => ['title' => fake()->sentence(3)],
        ];
    }
}
