<?php

namespace App\Services\Radar\Embeddings;

use App\Jobs\Radar\EmbedRadarListings;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Services\Ai\ModelLink;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-2423 — quelles annonces demandent un vecteur, et le lot du balayage planifié (`radar:embed-listings`).
 *
 * **Quelles annonces** : extraites, aux étapes où le refus STOP a été jugé (`ExtractRadarListing`). Ni une annonce capturée, dont
 * le texte n'a encore été jugé par personne, ni un annonceur qui a refusé, ni une annonce purgée : leur texte ne sort pas.
 * Une annonce dont le texte n'a pas changé (même empreinte, même modèle) n'est pas reprise : c'est tout le contrôle du coût.
 *
 * **Pas de boucle de réessais** : un seul job en file, une seule tentative, puis une pause après un échec. Un fournisseur en
 * panne reçoit au plus un appel par `cooldown_minutes`, et chacun se lit au journal. Le texte qui ferait toujours échouer un lot
 * n'est pas isolé : borné à 1 000 caractères et non vide, aucune règle publiée de Voyage ne le refuse (limite connue).
 */
final class RadarEmbeddingSweep
{
    private const PAUSE_KEY = 'radar:embeddings:paused';

    private const STAGES = [
        RadarListingStage::Extracted, RadarListingStage::Reviewed, RadarListingStage::Contacted,
        RadarListingStage::Consented, RadarListingStage::Published,
    ];

    public function __construct(private readonly RadarEmbeddingTarget $target) {}

    /** @return Builder<RadarListing> */
    public function due(ModelLink $link): Builder
    {
        return RadarListing::query()
            ->whereIn('stage', array_map(fn (RadarListingStage $stage) => $stage->value, self::STAGES))
            ->whereNotNull('similarity_text')
            ->whereNotExists(fn ($query) => $this->target->freshVectorOf($query, $link));
    }

    /** @return int le nombre d'annonces mises en file */
    public function run(): int
    {
        $link = $this->target->current();
        if ($link === null || $this->paused()) {
            return 0;
        }

        $ids = $this->due($link)
            ->orderByDesc('id')
            ->limit(max(1, (int) config('radar.similarity.embeddings.batch')))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        if ($ids !== []) {
            EmbedRadarListings::dispatch($ids);
        }

        return count($ids);
    }

    public function pause(): void
    {
        try {
            Cache::put(self::PAUSE_KEY, true, now()->addMinutes((int) config('radar.similarity.embeddings.cooldown_minutes')));
        } catch (Throwable $e) {
            Log::warning('radar.embeddings.pause_failed', ['error' => class_basename($e)]);
        }
    }

    private function paused(): bool
    {
        try {
            return Cache::has(self::PAUSE_KEY);
        } catch (Throwable $e) {
            Log::warning('radar.embeddings.pause_failed', ['error' => class_basename($e)]);

            return false;
        }
    }
}
