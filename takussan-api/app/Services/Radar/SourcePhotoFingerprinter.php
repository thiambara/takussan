<?php

namespace App\Services\Radar;

use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use App\Support\PhotoFingerprint;

/**
 * TCK-2387 (ADR-0054, ADR-0077 §9) — l'empreinte dHash d'une photo source : lue par le chemin protégé
 * de {@see UrlFetcher::fetchImage()}, décodée en mémoire par {@see PhotoFingerprint}, jetée. Seuls
 * l'empreinte et ses quatre bandes sortent d'ici ; la photo n'est ni écrite ni rendue.
 *
 * Rend `{url, hash, b0..b3}` ou `{url, hash: null, error}` ; lève {@see RadarFetchDeferred} (le
 * domaine est pris : l'appelant se relâche), jamais {@see RadarFetchRefused}, traduit en `error`.
 */
final class SourcePhotoFingerprinter
{
    /** Les dimensions annoncées par l'en-tête dépassent les bornes : l'image n'est jamais décodée. */
    public const ERROR_TOO_MANY_PIXELS = 'radar.photo.too_many_pixels';

    /** Le décodage de GD a échoué sur des octets qui ressemblaient à une image. */
    public const ERROR_UNREADABLE = 'radar.photo.unreadable';

    public function __construct(private readonly UrlFetcher $fetcher) {}

    /**
     * @return array<string, mixed>
     *
     * @throws RadarFetchDeferred
     */
    public function fingerprint(string $url): array
    {
        try {
            $image = $this->fetcher->fetchImage($url);
        } catch (RadarFetchRefused $e) {
            return ['url' => $url, 'hash' => null, 'error' => $e->code];
        }

        // Bornes de pixels lues dans l'en-tête, AVANT tout décodage : un PNG uni de 20 000 × 20 000 pèse
        // quelques Ko et demanderait ~1,6 Go à GD.
        $maxSide = (int) config('radar.photos.max_side');
        if ($image->width > $maxSide || $image->height > $maxSide
            || $image->width * $image->height > (int) config('radar.photos.max_pixels')) {
            return ['url' => $url, 'hash' => null, 'error' => self::ERROR_TOO_MANY_PIXELS];
        }

        $hash = PhotoFingerprint::fromBinary($image->bytes);
        // Les octets ne vont nulle part : ils s'en vont avec la variable.
        unset($image);
        if ($hash === null) {
            return ['url' => $url, 'hash' => null, 'error' => self::ERROR_UNREADABLE];
        }

        [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);

        return ['url' => $url, 'hash' => $hash, 'b0' => $b0, 'b1' => $b1, 'b2' => $b2, 'b3' => $b3];
    }
}
