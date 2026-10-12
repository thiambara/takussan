<?php

namespace Database\Factories;

use App\Models\GeoRegion;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class GeoRegionFactory extends Factory
{
    protected $model = GeoRegion::class;

    public function definition(): array
    {
        $nom = 'Région '.fake()->unique()->lexify('????????');

        return [
            'code' => 'T-'.fake()->unique()->numerify('#####'),
            'slug' => Str::slug($nom),
            'name' => $nom,
            'latitude' => 14.7,
            'longitude' => -17.4,
        ];
    }
}
