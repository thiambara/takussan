<?php

namespace Database\Factories;

use App\Models\Address;
use App\Models\Property;
use Illuminate\Database\Eloquent\Factories\Factory;

class AddressFactory extends Factory
{
    protected $model = Address::class;

    public function definition(): array
    {
        $quarters = ['Almadies', 'Mermoz', 'Sacré-Cœur', 'Plateau', 'Fann', 'Ouakam', 'Yoff', 'Ngor', 'Point E'];

        return [
            'addressable_type' => Property::class,
            'addressable_id' => Property::factory(),
            'street' => fake()->streetAddress(),
            'neighborhood' => fake()->randomElement($quarters),
            'city' => 'Dakar',
            'region' => 'Dakar',
            'country' => 'SN',
            'latitude' => fake()->latitude(14.6, 14.8),
            'longitude' => fake()->longitude(-17.5, -17.3),
        ];
    }
}
