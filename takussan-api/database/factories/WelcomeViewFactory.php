<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\WelcomeView;
use Illuminate\Database\Eloquent\Factories\Factory;

class WelcomeViewFactory extends Factory
{
    protected $model = WelcomeView::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'key' => 'customer-welcome',
            'seen_at' => now(),
        ];
    }
}
