<?php

namespace Database\Factories;

use App\Models\Enums\SettingScope;
use Illuminate\Database\Eloquent\Factories\Factory;

class SettingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'key' => $this->faker->unique()->word() . '_setting',
            'value' => ['enabled' => $this->faker->boolean()],
            'scope' => SettingScope::Global->value,
            'scope_id' => null,
        ];
    }
}
