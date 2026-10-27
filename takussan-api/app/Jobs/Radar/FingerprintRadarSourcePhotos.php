<?php

namespace App\Jobs\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\RadarListing;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\SourcePhotoFingerprinter;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * TCK-2387 (ADR-0054, ADR-0077) — le calcul de l'empreinte des photos source d'une annonce-URL, sur la
 * file `media` (celle du dHash d'ADR-0054, `worker-media`). Mis en file par `ExtractRadarListing` APRÈS
 * une extraction réussie : une annonce STOP ou en échec ne fait télécharger aucune photo.
 *
 * Le calcul passe par le réseau (jusqu'à 45 s par lecture, 5 s entre deux lectures d'un même domaine) :
 * il ne tient pas dans un seul passage. Une **passe** traite les photos restantes — les
 * `radar.photos.max_per_listing` premières de `photo_urls` qui n'ont pas encore d'élément —, écrit APRÈS
 * CHAQUE photo (`source_photo_hashes` gagne un élément), et s'arrête quand le budget
 * (`pass_budget_seconds`) est dépassé : elle se relâche (`release(0)`), la suivante reprend. Une lecture
 * différée (domaine pris) relâche du délai demandé. Au moins une photo par passe : un budget nul avance.
 * Pire cas d'une passe : le budget (30 s) + une lecture (45 s) + le décodage, sous le `$timeout`.
 *
 * Seule une annonce `extracted` ou `reviewed` est écrite, relue sous `lockForUpdate` : une annonce écartée
 * ou passée en doublon pendant la passe n'est pas réécrite, et la passe s'arrête.
 *
 * `failed()` complète les photos restantes avec `radar.photo.abandoned`, pour que l'état finisse `done`
 * (`RadarListing::photoFingerprintStatus()`).
 *
 * ADR-0078 : `$timeout` + 5 s ≤ `retry_after` de `database` (90 s) ; `$failOnTimeout` faux, donc un
 * dépassement n'échoue pas le job, la file le reprend, et seule la fenêtre de 6 h est terminale.
 */
final class FingerprintRadarSourcePhotos implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public const ERROR_ABANDONED = 'radar.photo.abandoned';

    public int $timeout = 85;

    public bool $failOnTimeout = false;

    /** Un seul exemplaire à la fois par annonce, au plus une heure. */
    public int $uniqueFor = 3600;

    public function __construct(public readonly int $listingId)
    {
        $this->onQueue('media');
    }

    public function uniqueId(): string
    {
        return (string) $this->listingId;
    }

    public function retryUntil(): DateTimeInterface
    {
        return now()->addHours(6);
    }

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping((string) $this->listingId))->releaseAfter(30)->expireAfter($this->timeout + 30)];
    }

    public function handle(SourcePhotoFingerprinter $fingerprinter): void
    {
        $listing = RadarListing::query()->find($this->listingId);
        if ($listing === null || ! $this->eligible($listing)) {
            return;
        }

        $remaining = $this->remaining($listing);
        if ($remaining === []) {
            // Rien à tenter : « calculé, aucune photo » (`[]`), à distinguer de « jamais calculé » (null).
            $this->append(0, null);

            return;
        }

        $started = hrtime(true);
        $index = count($listing->source_photo_hashes ?? []);
        foreach ($remaining as $i => $url) {
            if ($i > 0 && (hrtime(true) - $started) / 1e9 >= (float) config('radar.photos.pass_budget_seconds')) {
                $this->release(0);

                return;
            }

            try {
                $entry = $fingerprinter->fingerprint($url);
            } catch (RadarFetchDeferred $e) {
                $this->release($e->retryAfterSeconds);

                return;
            }

            if (! $this->append($index + $i, $entry)) {
                return;
            }
        }
    }

    /** Appelé quand le job est abandonné : les photos restantes sont déclarées abandonnées, l'état finit `done`. */
    public function failed(?Throwable $e): void
    {
        DB::transaction(function (): void {
            $listing = RadarListing::query()->whereKey($this->listingId)->lockForUpdate()->first();
            if ($listing === null || ! $this->eligible($listing)) {
                return;
            }
            $entries = $listing->source_photo_hashes ?? [];
            foreach ($this->remaining($listing) as $url) {
                $entries[] = ['url' => $url, 'hash' => null, 'error' => self::ERROR_ABANDONED];
            }
            $listing->source_photo_hashes = $entries;
            $listing->save();
        });
    }

    /** Une annonce-URL lue : `extracted` ou `reviewed`. */
    private function eligible(RadarListing $listing): bool
    {
        return $listing->source_kind === RadarSourceKind::Url
            && in_array($listing->stage, [RadarListingStage::Extracted, RadarListingStage::Reviewed], true);
    }

    /**
     * Les URL qui n'ont pas encore d'élément : les `max_per_listing` premières de `photo_urls`, moins
     * celles déjà tentées (les éléments s'ajoutent dans l'ordre, une passe à la fois).
     *
     * @return list<string> indexées de 0
     */
    private function remaining(RadarListing $listing): array
    {
        $urls = array_slice(array_values((array) ($listing->photo_urls ?? [])), 0, (int) config('radar.photos.max_per_listing'));

        return array_values(array_slice($urls, count($listing->source_photo_hashes ?? [])));
    }

    /**
     * Ajoute un élément (ou, pour `null`, pose `[]` si rien n'a jamais été calculé), sous verrou, et
     * seulement si l'annonce l'autorise encore et que c'est bien l'élément attendu (`$index` : rang
     * attendu, pour qu'une reprise ne double jamais une photo).
     */
    private function append(int $index, ?array $entry): bool
    {
        return DB::transaction(function () use ($index, $entry): bool {
            $listing = RadarListing::query()->whereKey($this->listingId)->lockForUpdate()->first();
            if ($listing === null || ! $this->eligible($listing)) {
                return false;
            }
            $existing = $listing->source_photo_hashes;
            if ($entry === null) {
                if ($existing === null) {
                    $listing->source_photo_hashes = [];
                    $listing->save();
                }

                return true;
            }
            if (count($existing ?? []) !== $index) {
                return false;
            }
            $listing->source_photo_hashes = [...($existing ?? []), $entry];
            $listing->save();

            return true;
        });
    }
}
