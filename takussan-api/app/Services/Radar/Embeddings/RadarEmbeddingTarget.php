<?php

namespace App\Services\Radar\Embeddings;

use App\Ai\Usages\RadarEmbeddingUsage;
use App\Models\AiUsageSetting;
use App\Models\Embedding;
use App\Models\RadarListing;
use App\Services\Ai\AiProviderCatalogue;
use App\Services\Ai\EmbeddingsTable;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * TCK-2423 — les vecteurs valables du Radar : le premier maillon du rôle `embedding`, et rien d'autre. Deux modèles ne se
 * comparent pas, donc le second maillon d'une chaîne ne servirait à rien ici. `null` quand le pilote n'est pas configuré
 * ({@see self::current()}) : c'est le seul endroit qui le décide, et le signal retombe alors sur `trigram`.
 *
 * L'ordre évite toute requête quand aucune clé n'existe : sans clé, l'appariement ne change pas d'une seule requête.
 */
final class RadarEmbeddingTarget
{
    public function __construct(
        private readonly AiProviderCatalogue $providers,
        private readonly ModelResolver $resolver,
        private readonly EmbeddingsTable $table,
    ) {}

    public function current(): ?ModelLink
    {
        if (config('radar.similarity.driver') !== 'embeddings' || ! $this->providers->anyEmbeddingKeyPresent()) {
            return null;
        }

        $setting = AiUsageSetting::query()->where('usage_key', RadarEmbeddingUsage::KEY)->first();
        $link = $this->resolver->chainFor(new RadarEmbeddingUsage, $setting)[0] ?? null;

        return $link !== null && $this->providers->servesEmbeddings($link->provider) && $this->providers->reachable($link->provider) && $this->table->exists()
            ? $link
            : null;
    }

    public function dimension(): int
    {
        return (int) config('radar.similarity.embeddings.dimension');
    }

    /**
     * Les vecteurs de ce maillon sur les annonces. Le sous-select tient le filtre sur la dimension AVANT toute comparaison
     * (`OFFSET 0` : pas d'aplatissement par le planificateur) : `<=>` lève sur deux dimensions différentes.
     */
    public function vectors(ModelLink $link): Builder
    {
        return Embedding::query()
            ->where('embeddable_type', (new RadarListing)->getMorphClass())
            ->where('provider', $link->provider)
            ->where('model', $link->model)
            ->where('dimension', $this->dimension());
    }

    /** Le filtre « le vecteur de cette annonce est à jour » : même maillon, et empreinte du texte actuel. */
    public function freshVectorOf(QueryBuilder $query, ModelLink $link): void
    {
        $query->selectRaw('1')->from('embeddings')
            ->where('embeddings.embeddable_type', (new RadarListing)->getMorphClass())
            ->whereColumn('embeddings.embeddable_id', 'radar_listings.id')
            ->where('embeddings.provider', $link->provider)
            ->where('embeddings.model', $link->model)
            ->where('embeddings.dimension', $this->dimension())
            ->whereRaw('embeddings.content_hash = '.Embedding::contentHashSql('radar_listings.similarity_text'));
    }
}
