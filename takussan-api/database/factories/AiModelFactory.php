<?php

namespace Database\Factories;

use App\Models\AiModel;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiModel>
 *
 * Un identifiant fictif : aucun identifiant de vrai modèle hors de `config/ai.php`
 * (`scripts/check-ai-usages.mjs`).
 */
class AiModelFactory extends Factory
{
    protected $model = AiModel::class;

    public function definition(): array
    {
        return [
            'provider' => 'anthropic',
            'model' => 'modele-'.$this->faker->unique()->numberBetween(1000, 999999),
            'input' => '1',
            'output' => '5',
            'cache_read' => '0.1',
            'cache_write' => '1.25',
            'active' => true,
        ];
    }
}
