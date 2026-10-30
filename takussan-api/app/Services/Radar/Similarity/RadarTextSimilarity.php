<?php

namespace App\Services\Radar\Similarity;

use App\Models\RadarListing;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2392 — le pilote du quatrième signal de rapprochement (`RadarMatcher::SIGNAL_TEXT`), choisi par
 * `radar.similarity.driver`. Livré : `trigram` ({@see TrigramTextSimilarity}, sans fournisseur). Un pilote d'embeddings
 * (ADR-0076 § 11) le remplacera derrière ce même contrat : TCK-2423.
 */
interface RadarTextSimilarity
{
    /**
     * Parmi `$candidates` (des annonces, déjà restreintes par l'appelant), celles dont le texte ressemble à `$text` au moins
     * à `radar.similarity.threshold`, de la plus proche à la plus éloignée.
     *
     * @param  Builder<RadarListing>  $candidates
     * @return list<array{id: int, score: float}> score entre 0 et 1
     */
    public function similar(Builder $candidates, string $text, int $limit): array;
}
