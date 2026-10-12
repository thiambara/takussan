<?php

namespace Database\Factories;

use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class GeoNeighborhoodFactory extends Factory
{
    protected $model = GeoNeighborhood::class;

    public function definition(): array
    {
        $nom = 'Quartier '.fake()->unique()->lexify('????????');

        return [
            'geo_city_id' => GeoCity::factory(),
            'slug' => Str::slug($nom),
            'name' => $nom,
            'latitude' => 14.7,
            'longitude' => -17.4,
            'status' => ReferentialStatus::Approved,
            'origin' => GeoNeighborhoodOrigin::Dataset,
        ];
    }

    public function pending(User $auteur): static
    {
        return $this->state(fn () => [
            'status' => ReferentialStatus::Pending,
            'origin' => GeoNeighborhoodOrigin::User,
            'created_by_id' => $auteur->id,
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn () => ['status' => ReferentialStatus::Rejected]);
    }
}
