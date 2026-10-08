<?php

namespace Database\Factories;

use App\Models\Enums\ContactLeadChannel;
use App\Models\Property;
use App\Models\PropertyContactLead;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * TCK-590 — la première fabrique de pistes : la boîte « Demandes » se teste sur des pistes déjà
 * là, sans repasser par l'endpoint public et son limiteur.
 *
 * @extends Factory<PropertyContactLead>
 */
class PropertyContactLeadFactory extends Factory
{
    protected $model = PropertyContactLead::class;

    public function definition(): array
    {
        return [
            'property_id' => Property::factory(),
            'agency_id' => fn (array $attributes) => $attributes['property_id'] !== null
                ? Property::query()->whereKey($attributes['property_id'])->value('agency_id')
                : null,
            'recipient_user_id' => null,
            'channel' => ContactLeadChannel::Form,
            'name' => $this->faker->name(),
            'email' => $this->faker->safeEmail(),
            'phone' => '+22177'.$this->faker->numerify('#######'),
            'message' => $this->faker->sentence(12),
            'locale' => 'fr',
            'ip' => $this->faker->ipv4(),
            'user_agent' => 'Mozilla/5.0',
        ];
    }

    /** Un clic WhatsApp / Appeler : ni identité, ni message. */
    public function click(ContactLeadChannel $channel = ContactLeadChannel::Whatsapp): static
    {
        return $this->state(fn () => [
            'channel' => $channel,
            'name' => null,
            'email' => null,
            'phone' => null,
            'message' => null,
        ]);
    }

    public function handled(): static
    {
        return $this->state(fn () => ['handled_at' => now()]);
    }
}
