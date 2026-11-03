<?php

namespace Database\Factories;

use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarListing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * TCK-2386 — une annonce capturée à la main, sans annonceur ni extraction. `purge_at` est posé par le modèle.
 *
 * @extends Factory<RadarListing>
 */
class RadarListingFactory extends Factory
{
    protected $model = RadarListing::class;

    public function definition(): array
    {
        $texte = fake()->unique()->paragraph();

        return [
            'source_kind' => RadarSourceKind::Text,
            'source_site' => RadarSourceSite::Other,
            'raw_text' => $texte,
            'photo_urls' => [],
            'content_fingerprint' => hash('sha256', $texte),
            'matches' => [],
            'stage' => RadarListingStage::Captured,
            'extraction_attempts' => 0,
        ];
    }

    /**
     * TCK-2387 — une fiche lue : l'étape `extracted` et une sortie normalisée COMPLÈTE, de la forme que rend
     * `ExtractionNormalizer` (chaque champ en `{value, confidence, evidence, flags}`, `phones_dropped`
     * compris). Un champ passé en `$overrides` complète son entrée ; toute autre clé la remplace.
     *
     * @param  array<string, mixed>  $overrides
     */
    public function extracted(array $overrides = []): static
    {
        return $this->state(function (array $attributes) use ($overrides): array {
            $champ = fn (mixed $value, ?string $evidence = null, array $extra = []): array => [
                'value' => $value,
                'confidence' => 'high',
                'evidence' => $evidence,
                'flags' => [],
            ] + $extra;

            $extracted = [
                'property_type' => $champ('apartment', 'appartement'),
                'contract' => $champ('rent', 'à louer'),
                'rent_period' => $champ('monthly', 'par mois'),
                'price' => $champ(450000, '450 000 FCFA par mois', ['raw' => '450 000 FCFA par mois', 'period' => 'monthly']),
                'neighborhood' => $champ('Mermoz', 'Mermoz', ['neighborhood_id' => null, 'suggestions' => []]),
                'city' => $champ('Dakar', 'Dakar'),
                'bedrooms' => $champ(3, '3 chambres'),
                'bathrooms' => $champ(2, '2 salles de bain'),
                'surface_m2' => $champ(120, '120 m2'),
                'furnished' => $champ(false),
                'amenities' => $champ(['parking'], 'parking'),
                'title' => $champ('Appartement 3 chambres à Mermoz', 'Appartement 3 chambres à Mermoz'),
                'description' => $champ('Appartement lumineux, proche des commerces.', 'Appartement lumineux'),
                'advertiser_name' => $champ('Awa', 'Awa'),
                'advertiser_nature' => $champ('probable_owner', 'propriétaire'),
                'phones' => ['+221771234567'],
                'phones_flags' => [],
                'phones_dropped' => [],
                'nature_signals' => [],
            ];
            foreach ($overrides as $cle => $valeur) {
                $actuel = $extracted[$cle] ?? null;
                $extracted[$cle] = is_array($valeur) && is_array($actuel) && ! array_is_list($actuel)
                    ? array_replace($actuel, $valeur)
                    : $valeur;
            }

            return ['stage' => RadarListingStage::Extracted, 'extracted' => $extracted, 'extracted_at' => now()];
        });
    }

    /** TCK-2388 — une fiche lue puis validée par l'opérateur : `extracted()`, à l'étape `reviewed`. */
    public function reviewed(): static
    {
        return $this->extracted()->state(['stage' => RadarListingStage::Reviewed]);
    }

    /**
     * TCK-2387 — les empreintes des photos source déjà calculées (`[]` : calculé, aucune photo).
     *
     * @param  list<array<string, mixed>>  $hashes
     */
    public function withPhotoHashes(array $hashes): static
    {
        return $this->state(['source_photo_hashes' => $hashes]);
    }
}
