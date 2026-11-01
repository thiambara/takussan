<?php

namespace Database\Factories;

use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * TCK-2388 — un message de démarchage préparé, jamais envoyé : annonceur, langue `fr`, clauses `accord.v1`, texte non
 * vide. `sent()` l'envoie, `withListings()` lui donne ses annonces, `followUpOf()` en fait la relance d'un autre.
 *
 * @extends Factory<RadarOutreach>
 */
class RadarOutreachFactory extends Factory
{
    protected $model = RadarOutreach::class;

    public function definition(): array
    {
        return [
            'radar_advertiser_id' => RadarAdvertiser::factory(),
            'channel' => 'whatsapp_manual',
            'locale' => 'fr',
            'clauses_version' => 'accord.v1',
            'salutation' => 'Bonjour Awa,',
            'summary' => 'votre appartement de 3 chambres à Mermoz',
            'message' => 'Bonjour Awa, nous avons vu votre appartement de 3 chambres à Mermoz. (clauses de test)',
        ];
    }

    /** Envoyé, sans issue : l'état de la file « en attente » puis « à relancer ». */
    public function sent(): static
    {
        return $this->state(fn () => ['sent_at' => now()]);
    }

    /** Les annonces que le message couvre, rattachées après la création. */
    public function withListings(RadarListing ...$listings): static
    {
        return $this->afterCreating(function (RadarOutreach $outreach) use ($listings): void {
            $outreach->listings()->attach(array_map(fn (RadarListing $l) => $l->id, $listings));
        });
    }

    /** La relance de `$origine` : même annonceur, rang suivant. */
    public function followUpOf(RadarOutreach $origine): static
    {
        return $this->state(fn () => [
            'radar_advertiser_id' => $origine->radar_advertiser_id,
            'follow_up_of_id' => $origine->id,
            'follow_up_rank' => $origine->follow_up_rank + 1,
        ]);
    }
}
