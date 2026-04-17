<?php

namespace Database\Factories;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class PropertyFactory extends Factory
{
    public function definition(): array
    {
        $quarters = ['Almadies', 'Mermoz', 'Sacré-Cœur', 'Plateau', 'Fann', 'Ouakam', 'Yoff'];
        $title = fake()->words(4, true);

        return [
            'title' => ucfirst($title),
            'slug' => Str::slug($title).'-'.Str::random(6),
            'description' => fake()->paragraphs(2, true),
            'type' => fake()->randomElement(PropertyType::cases())->value,
            'status' => PropertyStatus::Draft->value,
            'price' => fake()->numberBetween(150_000, 2_000_000),
            'location_quarter' => fake()->randomElement($quarters),
            'location_city' => 'Dakar',
            'bedrooms' => fake()->numberBetween(1, 5),
            'bathrooms' => fake()->numberBetween(1, 2),
            'area' => fake()->numberBetween(30, 250),
            'featured' => false,
            'owner_phone' => '+221'.fake()->numerify('7########'),
            'main_photo_url' => 'https://picsum.photos/800/533?random='.fake()->numberBetween(1, 100),
            'published_at' => null,
        ];
    }

    public function published(): static
    {
        return $this->state([
            'status' => PropertyStatus::Published->value,
            'published_at' => now(),
        ]);
    }
}
