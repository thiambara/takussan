<?php

namespace Database\Factories;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class DocumentFactory extends Factory
{
    protected $model = Document::class;

    public function definition(): array
    {
        return [
            'documentable_id' => Property::factory(),
            'documentable_type' => Property::class,
            'uploaded_by' => User::factory(),
            'name' => fake()->words(3, true),
            'type' => fake()->randomElement(DocumentType::cases())->value,
            'description' => fake()->optional()->sentence(),
            'is_verified' => false,
        ];
    }

    public function verified(): static
    {
        return $this->state(fn () => [
            'is_verified' => true,
            'verified_by' => User::factory(),
            'verified_at' => now(),
        ]);
    }
}
