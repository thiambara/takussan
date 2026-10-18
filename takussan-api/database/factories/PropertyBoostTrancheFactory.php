<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\PropertyBoostTranche;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * TCK-942 — la première tranche d'une Vedette achetée 7 jours, 20 crédits. Sans boost fourni, elle en
 * crée un, actif, sur un bien publié d'un espace neuf. Aucun mouvement de crédits n'est écrit : pour
 * un remboursement de bout en bout, passer par `BoostPurchaseService`.
 *
 * @extends Factory<PropertyBoostTranche>
 */
class PropertyBoostTrancheFactory extends Factory
{
    protected $model = PropertyBoostTranche::class;

    public function definition(): array
    {
        return [
            'property_boost_id' => function (array $attributes): int {
                $agency = Agency::factory()->create();
                $property = Property::factory()->published()->create(['agency_id' => $agency->id]);

                return PropertyBoost::query()->create([
                    'property_id' => $property->id,
                    'agency_id' => $agency->id,
                    'kind' => BoostKind::Featured,
                    'price_credits' => $attributes['price_credits'],
                    'duration_days' => $attributes['duration_days'],
                    'starts_at' => now(),
                    'ends_at' => now()->addDays($attributes['duration_days']),
                    'status' => BoostStatus::Active,
                    'offered' => $attributes['offered'],
                ])->id;
            },
            'position' => 1,
            'price_credits' => 20,
            'duration_days' => 7,
            'offered' => false,
        ];
    }

    /** Une tranche offerte par la plateforme : prix 0. */
    public function offered(): static
    {
        return $this->state(fn () => ['price_credits' => 0, 'offered' => true]);
    }
}
