<?php

namespace Database\Factories;

use App\Models\RadarConsent;
use App\Models\RadarOutreach;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * TCK-2388 — une réponse déposée sur un message : preuve par capture, vérification en attente, jamais confirmée.
 * L'annonceur est celui du message. `verified()` pose le verdict de l'IA, `confirmed()` la confirmation humaine.
 *
 * @extends Factory<RadarConsent>
 */
class RadarConsentFactory extends Factory
{
    protected $model = RadarConsent::class;

    public function definition(): array
    {
        return [
            'radar_outreach_id' => RadarOutreach::factory()->sent(),
            'radar_advertiser_id' => fn (array $attributes) => RadarOutreach::query()->findOrFail($attributes['radar_outreach_id'])->radar_advertiser_id,
            'proof' => 'screenshot',
            'capture_hashes' => [hash('sha256', fake()->unique()->uuid())],
            'verification_status' => 'pending',
        ];
    }

    /** @param  array<string, mixed>  $verdict */
    public function verified(array $verdict): static
    {
        return $this->state(fn () => ['ai_verdict' => $verdict, 'verification_status' => 'done']);
    }

    public function confirmed(User $by): static
    {
        return $this->state(fn () => ['confirmed_by_id' => $by->id, 'confirmed_at' => now()]);
    }
}
