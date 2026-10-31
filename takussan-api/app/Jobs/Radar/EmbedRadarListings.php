<?php

namespace App\Jobs\Radar;

use App\Ai\Usages\RadarEmbeddingUsage;
use App\Jobs\Concerns\RunsOnAiQueue;
use App\Models\Embedding;
use App\Models\RadarListing;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Radar\Embeddings\RadarEmbeddingSweep;
use App\Services\Radar\Embeddings\RadarEmbeddingTarget;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Throwable;

/**
 * TCK-2423 — les vecteurs d'un lot d'annonces, en un appel. Mis en file par {@see RadarEmbeddingSweep}, qui relit tout à
 * chaque balayage : une tentative, jamais de reprise du job. Un refus (plafond, coupe-circuit) ou une panne suspend les
 * balayages pendant `radar.similarity.embeddings.cooldown_minutes`, et le lot reste en `trigram` d'ici là.
 */
class EmbedRadarListings implements ShouldBeUnique, ShouldQueue
{
    use Queueable;
    use RunsOnAiQueue;

    public int $tries = 1;

    public int $timeout = 80;

    public int $uniqueFor = 300;

    /** @param  list<int>  $listingIds */
    public function __construct(public array $listingIds)
    {
        $this->onAiQueue();
    }

    public function handle(AiGateway $gateway, RadarEmbeddingTarget $target, RadarEmbeddingSweep $sweep): void
    {
        $link = $target->current();
        if ($link === null) {
            return;
        }

        // Relues : une annonce purgée, passée au STOP, ou déjà à jour depuis la mise en file, ne part pas.
        /** @var Collection<int, RadarListing> $listings */
        $listings = $sweep->due($link)->whereKey($this->listingIds)->get(['id', 'similarity_text']);
        if ($listings->isEmpty()) {
            return;
        }

        try {
            $result = $gateway->embed(
                new AiRequest(RadarEmbeddingUsage::KEY, '', link: $link),
                $listings->pluck('similarity_text')->all(),
                $target->dimension(),
            );
        } catch (AiRefused|AiUnavailable) {
            // Déjà journalisé par la passerelle.
            $sweep->pause();

            return;
        } catch (Throwable $e) {
            report($e);
            $sweep->pause();

            return;
        }

        $now = Carbon::now();
        $rows = [];
        foreach ($listings->values() as $i => $listing) {
            $rows[] = [
                'embeddable_type' => $listing->getMorphClass(),
                'embeddable_id' => $listing->id,
                'provider' => $result->link->provider,
                'model' => $result->link->model,
                'dimension' => $target->dimension(),
                'vector' => Embedding::literal($result->vectors[$i]),
                'content_hash' => Embedding::contentHash($listing->similarity_text),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        Embedding::query()->upsert(
            $rows,
            ['embeddable_type', 'embeddable_id', 'provider', 'model', 'dimension'],
            ['vector', 'content_hash', 'updated_at'],
        );
    }
}
