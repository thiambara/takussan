<?php

namespace Database\Factories;

use App\Models\Enums\RadarAdvertiserNature;
use App\Models\RadarAdvertiser;
use App\Support\RadarPhone;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * TCK-2386 — un annonceur du Radar : un mobile sénégalais unique, son empreinte à clé recalculée
 * depuis le téléphone fourni, nature inconnue.
 *
 * @extends Factory<RadarAdvertiser>
 */
class RadarAdvertiserFactory extends Factory
{
    protected $model = RadarAdvertiser::class;

    public function definition(): array
    {
        return [
            'phone' => fn () => '+22177'.fake()->unique()->numerify('#######'),
            'phone_hmac' => fn (array $attributes) => RadarPhone::hmac(
                $attributes['phone'] ?? '+22177'.fake()->unique()->numerify('#######'),
            ),
            'display_name' => fake()->name(),
            'nature' => RadarAdvertiserNature::Unknown,
            'nature_signals' => [],
        ];
    }

    /** Un annonceur qui a dit STOP : numéro en clair purgé, empreinte et date conservées. */
    public function doNotContact(): static
    {
        return $this->state(fn () => ['phone' => null, 'do_not_contact_at' => now()]);
    }
}
