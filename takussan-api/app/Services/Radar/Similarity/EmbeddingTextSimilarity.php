<?php

namespace App\Services\Radar\Similarity;

use App\Models\Embedding;
use App\Services\Radar\Embeddings\RadarEmbeddingTarget;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2423 — la similarité de texte par vecteurs, avec repli sur `trigram` signal par signal.
 *
 * - **Aucun appel à un fournisseur ici** : les vecteurs sont calculés en file `ai` (`EmbedRadarListings`). Une panne de Voyage
 *   ne peut donc pas empêcher un appariement : elle laisse seulement des annonces sans vecteur.
 * - **Repli** : pilote non configuré, clé absente, table absente ({@see RadarEmbeddingTarget::current()}), ou pas de vecteur à
 *   jour pour le texte comparé : tout passe par `trigram`. Sinon, seules les annonces sans vecteur à jour y passent.
 * - **Deux échelles** : une similarité cosinus n'est pas un score de trigrammes. Chaque ligne dit sa méthode, et le seuil
 *   vectoriel est `radar.similarity.embeddings.threshold`. Les vecteurs passent d'abord, puis les trigrammes, sans tri commun.
 */
final class EmbeddingTextSimilarity implements RadarTextSimilarity
{
    public const METHOD = 'embeddings';

    public function __construct(
        private readonly RadarEmbeddingTarget $target,
        private readonly TrigramTextSimilarity $trigram,
    ) {}

    public function similar(Builder $candidates, string $text, int $limit): array
    {
        $link = $this->target->current();
        if ($link === null) {
            return $this->trigram->similar($candidates, $text, $limit);
        }

        $source = $this->target->vectors($link)->where('content_hash', Embedding::contentHash($text))->toBase()->value('vector');
        if ($source === null) {
            return $this->trigram->similar($candidates, $text, $limit);
        }

        $threshold = (float) config('radar.similarity.embeddings.threshold');
        $vectors = $this->target->vectors($link)->select(['embeddable_id', 'vector', 'content_hash'])->offset(0)->toBase();
        $hits = (clone $candidates)
            ->whereNotNull('similarity_text')
            ->joinSub($vectors, 'listing_vectors', 'listing_vectors.embeddable_id', '=', 'radar_listings.id')
            ->whereRaw('listing_vectors.content_hash = '.Embedding::contentHashSql('radar_listings.similarity_text'))
            ->whereRaw('1 - (listing_vectors.vector <=> ?::vector) >= ?', [$source, $threshold])
            ->selectRaw('radar_listings.id as id, 1 - (listing_vectors.vector <=> ?::vector) as score', [$source])
            ->orderByDesc('score')
            ->orderByDesc('radar_listings.id')
            ->limit($limit)
            ->toBase()
            ->get()
            ->map(fn ($row) => ['id' => (int) $row->id, 'score' => round((float) $row->score, 4), 'method' => self::METHOD])
            ->all();

        $left = $limit - count($hits);
        if ($left <= 0) {
            return $hits;
        }

        $withoutVector = (clone $candidates)->whereNotExists(fn ($query) => $this->target->freshVectorOf($query, $link));

        return [...$hits, ...$this->trigram->similar($withoutVector, $text, $left)];
    }
}
