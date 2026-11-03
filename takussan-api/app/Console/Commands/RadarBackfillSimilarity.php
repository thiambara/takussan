<?php

namespace App\Console\Commands;

use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Support\RadarSimilarityText;
use Illuminate\Console\Command;

/**
 * TCK-2392 (ADR-0080) — à lancer une fois par le porteur après le déploiement : les annonces saisies avant la colonne
 * `similarity_text` n'ont pas de texte comparé, et le quatrième signal de rapprochement (`RadarMatcher::SIGNAL_TEXT`) ne
 * les voit pas tant que leur lecture ne change pas. La commande le calcule par lots, par la règle du modèle
 * ({@see RadarSimilarityText::of()}), sans toucher à `updated_at` : rien de l'annonce n'a changé.
 *
 * Idempotente : elle ne prend que les annonces sans texte comparé qui ont une lecture ; une seconde exécution ne
 * trouve plus que celles dont le texte est trop court pour être comparé. Une annonce purgée n'a plus de lecture.
 */
class RadarBackfillSimilarity extends Command
{
    protected $signature = 'radar:backfill-similarity {--chunk=500 : annonces par lot}';

    protected $description = 'Calcule le texte comparé (similarity_text) des annonces du Radar saisies avant la collecte automatique.';

    public function handle(): int
    {
        $filled = 0;
        RadarListing::query()
            ->whereNull('similarity_text')
            ->where('stage', '!=', RadarListingStage::Purged->value)
            ->where(fn ($query) => $query->whereNotNull('extracted')->orWhereNotNull('raw_text'))
            ->select(['id', 'extracted', 'raw_text'])
            ->chunkById(max(1, (int) $this->option('chunk')), function ($listings) use (&$filled): void {
                foreach ($listings as $listing) {
                    $text = RadarSimilarityText::of($listing->extracted, $listing->raw_text);
                    if ($text !== null) {
                        $filled += RadarListing::query()->whereKey($listing->id)->whereNull('similarity_text')
                            ->toBase()->update(['similarity_text' => $text]);
                    }
                }
            });

        $this->info("radar:backfill-similarity — {$filled} annonce(s) complétée(s).");

        return self::SUCCESS;
    }
}
