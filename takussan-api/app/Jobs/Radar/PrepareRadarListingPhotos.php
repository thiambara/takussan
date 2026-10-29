<?php

namespace App\Jobs\Radar;

use App\Models\RadarListing;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use App\Services\Radar\RadarPhotoReserve;
use App\Services\Radar\UrlFetcher;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * TCK-2389 (ADR-0077 §6, décision 3a) — la lecture des photos d'une annonce-URL APRÈS l'accord confirmé, rangées dans la
 * réserve (`radar_photos`, disque privé), sur la file `media`. Mis en file par `RadarConsentWorkflow::confirm()` et par la
 * relance de l'opérateur : une annonce qui n'a pas d'accord ne fait télécharger aucune photo.
 *
 * Même patron que {@see FingerprintRadarSourcePhotos} : une **passe** traite les URL sans élément, écrit APRÈS CHAQUE photo
 * (`photo_preparation` gagne un élément, la photo est rangée dans la même transaction), s'arrête au budget
 * (`pass_budget_seconds`) en se relâchant, relâche du délai demandé sur une lecture différée, et avance d'au moins une photo
 * par passe. Chaque URL passe par le chemin protégé de {@see UrlFetcher::fetchImage()}, puis par
 * {@see RadarPhotoReserve::encode()} (bornes de pixels, réencodage).
 *
 * Seule une annonce `consented` dont la source est une URL est écrite, relue sous `lockForUpdate` ; l'élément écrit est
 * celui attendu à son rang, pour qu'une reprise ne range jamais deux fois la même photo. Les URL restantes sont celles sans
 * élément : après une relance, qui retire les éléments en erreur, les rangs restent ceux du nombre d'éléments présents.
 *
 * `failed()` complète les URL restantes avec `radar.photo.abandoned` : l'état finit `done`.
 *
 * ADR-0078 : `$timeout` + 5 s ≤ `retry_after` de `database` (90 s) ; `$failOnTimeout` faux.
 */
final class PrepareRadarListingPhotos implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public const ERROR_ABANDONED = 'radar.photo.abandoned';

    /** La fenêtre de reprise : le job est abandonné (`failed()`) au-delà. */
    public const WINDOW_SECONDS = 6 * 3600;

    /** Reprises après une exception que la passe ne rattrape pas (base, disque en panne), en secondes. */
    public const BACKOFF_SECONDS = [10, 60, 300];

    public int $timeout = 85;

    public bool $failOnTimeout = false;

    /** Un seul exemplaire à la fois par annonce, sur toute la fenêtre de {@see self::retryUntil()} (6 h). */
    public int $uniqueFor = self::WINDOW_SECONDS;

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
        return now()->addSeconds(self::WINDOW_SECONDS);
    }

    /**
     * Espace les reprises : le worker n'a pas de `--backoff`, une exception imprévue rejouerait sinon le job sans délai,
     * en boucle, sur la file `media` partagée.
     *
     * @return list<int>
     */
    public function backoff(): array
    {
        return self::BACKOFF_SECONDS;
    }

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping((string) $this->listingId))->releaseAfter(30)->expireAfter($this->timeout + 30)];
    }

    public function handle(UrlFetcher $fetcher, RadarPhotoReserve $reserve): void
    {
        $listing = RadarListing::query()->find($this->listingId);
        if ($listing === null || ! $listing->photoPreparable()) {
            return;
        }

        $remaining = $this->remaining($listing);
        if ($remaining === []) {
            // Rien à tenter : « préparée, aucune URL » (`[]`), à distinguer de « jamais préparée » (null).
            $this->markPrepared();

            return;
        }

        $started = hrtime(true);
        $index = count($listing->photo_preparation ?? []);
        foreach ($remaining as $i => $url) {
            if ($i > 0 && (hrtime(true) - $started) / 1e9 >= (float) config('radar.photos.pass_budget_seconds')) {
                $this->release(0);

                return;
            }

            try {
                $image = $fetcher->fetchImage($url);
                $photo = $reserve->encode($image->bytes);
                // Les octets lus ne vont nulle part : ils s'en vont avec la variable.
                unset($image);
            } catch (RadarFetchRefused $e) {
                $photo = ['error' => $e->code];
            } catch (RadarFetchDeferred $e) {
                $this->release($e->retryAfterSeconds);

                return;
            }

            if (! $this->append($index + $i, $url, $photo, $reserve)) {
                return;
            }
        }
    }

    /** Appelé quand le job est abandonné : les URL restantes sont déclarées abandonnées, l'état finit `done`. */
    public function failed(?Throwable $e): void
    {
        DB::transaction(function (): void {
            $listing = RadarListing::query()->whereKey($this->listingId)->lockForUpdate()->first();
            if ($listing === null || ! $listing->photoPreparable()) {
                return;
            }
            $entries = $listing->photo_preparation ?? [];
            foreach ($this->remaining($listing) as $url) {
                $entries[] = ['url' => $url, 'media_id' => null, 'error' => self::ERROR_ABANDONED];
            }
            $listing->photo_preparation = $entries;
            $listing->save();
        });
    }

    /**
     * Les URL sans élément, dans l'ordre de `photo_urls`.
     *
     * @return list<string>
     */
    private function remaining(RadarListing $listing): array
    {
        $tried = array_column((array) ($listing->photo_preparation ?? []), 'url');

        return array_values(array_diff($listing->preparableUrls(), $tried));
    }

    /** Pose `[]` si rien n'a jamais été préparé, sous verrou et seulement si l'annonce l'autorise encore. */
    private function markPrepared(): void
    {
        DB::transaction(function (): void {
            $listing = RadarListing::query()->whereKey($this->listingId)->lockForUpdate()->first();
            if ($listing !== null && $listing->photoPreparable() && $listing->photo_preparation === null) {
                $listing->photo_preparation = [];
                $listing->save();
            }
        });
    }

    /**
     * Ajoute l'élément de cette URL, sous verrou, et seulement si l'annonce l'autorise encore et que c'est bien l'élément
     * attendu (`$index` : rang attendu, pour qu'une reprise ne range jamais deux fois une photo). La photo est rangée dans la
     * même transaction ; son fichier s'efface si l'écriture de l'élément échoue après.
     *
     * @param  array{bytes: string, mime: string}|array{error: string}  $photo
     */
    private function append(int $index, string $url, array $photo, RadarPhotoReserve $reserve): bool
    {
        return DB::transaction(function () use ($index, $url, $photo, $reserve): bool {
            $listing = RadarListing::query()->whereKey($this->listingId)->lockForUpdate()->first();
            if ($listing === null || ! $listing->photoPreparable()) {
                return false;
            }
            $existing = $listing->photo_preparation ?? [];
            if (count($existing) !== $index) {
                return false;
            }

            if (! isset($photo['error']) && $reserve->count($listing) >= (int) config('radar.photos.reserve_max')) {
                $photo = ['error' => RadarPhotoReserve::ERROR_RESERVE_FULL];
            }
            $media = isset($photo['error']) ? null : $reserve->store($listing, $photo['bytes'], $photo['mime'], 'fetched', $url);

            try {
                $listing->photo_preparation = [...$existing, $media === null
                    ? ['url' => $url, 'media_id' => null, 'error' => $photo['error']]
                    : ['url' => $url, 'media_id' => $media->id]];
                $listing->save();
            } catch (Throwable $e) {
                if ($media !== null) {
                    $reserve->discardFiles([$media]);
                }

                throw $e;
            }

            return true;
        });
    }
}
