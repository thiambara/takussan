<?php

namespace Database\Factories;

use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Support\Search\PropertyLabels;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class PropertyFactory extends Factory
{
    protected $model = Property::class;

    public function definition(): array
    {
        $title = fake()->words(4, true);

        $contractType = fake()->randomElement([ContractType::Sale, ContractType::Rent]);

        return [
            'user_id' => User::factory(),
            'agency_id' => null,
            'title' => ucfirst($title),
            'slug' => Str::slug($title).'-'.Str::random(6),
            'description' => fake()->paragraphs(2, true),
            'type' => fake()->randomElement(PropertyType::cases()),
            'contract_type' => $contractType,
            'rent_period' => $contractType === ContractType::Rent ? fake()->randomElement(RentPeriod::cases()) : null,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'price' => fake()->numberBetween(150_000, 50_000_000),
            'currency' => Currency::XOF,
            'area' => fake()->numberBetween(30, 500),
            // TCK-506 — pas de chambres hors habitation : un test qui tire un
            // `land` au hasard ne doit pas fabriquer un terrain à 3 chambres,
            // c'est exactement la fixture que `q=F4` ne doit jamais rendre.
            // Une valeur EXPLICITE passée à `make()`/`create()` prime toujours.
            'bedrooms' => fn (array $a) => match (true) {
                self::estUneChambre($a['type'] ?? null) => 1,
                self::estHabitable($a['type'] ?? null) => fake()->numberBetween(1, 5),
                default => null,
            },
            'bathrooms' => fn (array $a) => self::estHabitable($a['type'] ?? null) ? fake()->numberBetween(1, 3) : null,
            'furnished' => fake()->boolean(30),
            'featured' => false,
            'published_at' => now(),
        ];
    }

    /** Une chambre a exactement UNE chambre. */
    private static function estUneChambre(mixed $type): bool
    {
        return ($type instanceof PropertyType ? $type->value : $type) === PropertyType::Room->value;
    }

    /** Habitation au sens de {@see PropertyLabels::FAMILLES} — `room` compris. */
    private static function estHabitable(mixed $type): bool
    {
        return PropertyLabels::famille($type) === PropertyLabels::FAMILLE_HABITATION;
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
