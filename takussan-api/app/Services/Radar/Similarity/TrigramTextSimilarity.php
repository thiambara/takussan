<?php

namespace App\Services\Radar\Similarity;

use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2392 — la similarité de texte par trigrammes (`pg_trgm`), sur `radar_listings.similarity_text`
 * (`App\Support\RadarSimilarityText`). Aucun fournisseur, aucun appel réseau : un texte recopié d'un site à l'autre se
 * retrouve, une reformulation non (c'est le pilote d'embeddings de TCK-2423 qui la verra).
 *
 * `similarity_text % ?` emprunte l'index GIN `radar_listings_similarity_trgm` (seuil de `pg_trgm`, 0,3 par défaut) ;
 * `similarity()` applique ensuite le seuil de `radar.similarity.threshold`.
 */
final class TrigramTextSimilarity implements RadarTextSimilarity
{
    public const METHOD = 'trigram';

    public function similar(Builder $candidates, string $text, int $limit): array
    {
        $threshold = (float) config('radar.similarity.threshold', 0.5);

        return $candidates
            ->whereNotNull('similarity_text')
            ->whereRaw('similarity_text % ?', [$text])
            ->whereRaw('similarity(similarity_text, ?) >= ?', [$text, $threshold])
            ->selectRaw('id, similarity(similarity_text, ?) as score', [$text])
            ->orderByDesc('score')
            ->orderByDesc('id')
            ->limit($limit)
            ->toBase()
            ->get()
            ->map(fn ($row) => ['id' => (int) $row->id, 'score' => round((float) $row->score, 4), 'method' => self::METHOD])
            ->all();
    }
}
