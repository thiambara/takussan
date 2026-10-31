<?php

namespace App\Services\Radar\Similarity;

use App\Models\RadarListing;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2392 — le pilote du quatrième signal de rapprochement (`RadarMatcher::SIGNAL_TEXT`), choisi par
 * `radar.similarity.driver`. Livrés : `trigram` ({@see TrigramTextSimilarity}, sans fournisseur) et `embeddings`
 * ({@see EmbeddingTextSimilarity}, TCK-2423, ADR-0076 § 11), qui retombe sur le premier signal par signal.
 */
interface RadarTextSimilarity
{
    /**
     * Parmi `$candidates` (des annonces, déjà restreintes par l'appelant), celles dont le texte ressemble à `$text` au moins
     * à son seuil, les plus proches d'abord pour une même méthode. Deux méthodes ne sont pas sur la même échelle : `method`
     * dit laquelle a donné `score`, et l'appelant lit le seuil qui lui correspond.
     *
     * @param  Builder<RadarListing>  $candidates
     * @return list<array{id: int, score: float, method: string}> score entre 0 et 1
     */
    public function similar(Builder $candidates, string $text, int $limit): array;
}
