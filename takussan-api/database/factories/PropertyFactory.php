<?php

namespace Database\Factories;

use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class PropertyFactory extends Factory
{
    protected $model = Property::class;

    public function definition(): array
    {
        $title = fake()->words(4, true);

        return [
            'user_id' => User::factory(),
            'agency_id' => null,
            'title' => ucfirst($title),
            'slug' => Str::slug($title).'-'.Str::random(6),
            'description' => fake()->paragraphs(2, true),
            'type' => fake()->randomElement(PropertyType::cases()),
            'contract_type' => fake()->randomElement([ContractType::Sale, ContractType::Rent]),
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'price' => fake()->numberBetween(150_000, 50_000_000),
            'currency' => Currency::XOF,
            'area' => fake()->numberBetween(30, 500),
            'bedrooms' => fake()->numberBetween(1, 5),
            'bathrooms' => fake()->numberBetween(1, 3),
            'furnished' => fake()->boolean(30),
            'featured' => false,
            'published_at' => now(),
        ];
    }

    public function draft(): static
    {
        return $this->state([
            'status' => PropertyStatus::Draft,
            'published_at' => null,
        ]);
    }

    public function published(): static
    {
        return $this->state([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);
    }

    public function featured(): static
    {
        return $this->state(['featured' => true]);
    }
}
