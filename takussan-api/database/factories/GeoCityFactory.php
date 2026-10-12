<?php

namespace Database\Factories;

use App\Models\GeoCity;
use App\Models\GeoRegion;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class GeoCityFactory extends Factory
{
    protected $model = GeoCity::class;

    public function definition(): array
    {
        $nom = 'Ville '.fake()->unique()->lexify('????????');

        return [
            'geo_region_id' => GeoRegion::factory(),
            'slug' => Str::slug($nom),
            'name' => $nom,
            'latitude' => 14.7,
            'longitude' => -17.4,
        ];
    }
}
