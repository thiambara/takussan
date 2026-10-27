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
}
