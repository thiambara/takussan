<?php

namespace App\Services\Media;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Spatie\Image\Enums\Fit;
use Spatie\Image\Image;
use Spatie\MediaLibrary\MediaCollections\Exceptions\InvalidConversion;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * TCK-538 — une photo PRIVÉE dans un PDF, sans URL.
 *
 * Le PDF d'état des lieux passait `$media->getUrl()` à dompdf. Sur le disque privé
 * (ADR-0029 §2) cette URL n'est servie par personne : `local` n'a pas d'`url`, `r2-private`
 * ni domaine ni accès public — les photos disparaissaient du PDF, sans erreur. Les octets sont
 * donc lus PAR LE DISQUE (`Storage::disk(…)`, jamais `getPath()`) et embarqués en URI `data:`.
 *
 * Pour garder le PDF léger : une conversion `preview` ou `thumbnail` si le média en a une,
 * sinon l'original réduit à `$maxWidth` (sans agrandissement) et réencodé en JPEG.
 */
class PdfImageEmbedder
{
    /** Conversions préférées à l'original, dans l'ordre. */
    public const CONVERSIONS = ['preview', 'thumbnail'];

    /** Seuls formats embarqués : dompdf les lit, et rien d'autre (SVG compris) n'entre. */
    public const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    public function dataUri(Media $media, int $maxWidth = 600): ?string
    {
        try {
            foreach (self::CONVERSIONS as $conversion) {
                if ($bytes = $this->conversionBytes($media, $conversion)) {
                    return $this->encode($bytes);
                }
            }

            return $this->encode($this->reducedOriginal($media, $maxWidth));
        } catch (Throwable $e) {
            Log::warning('pdf.image_embed_failed', [
                'media_id' => $media->getKey(),
                'disk' => $media->disk,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Les octets d'une conversion produite, ou `null`. Un modèle qui ne DÉCLARE pas la
     * conversion (`Inventory`, `MaintenanceRequest` n'en ont aucune) fait lever
     * `getPathRelativeToRoot()` : c'est un « pas de conversion », pas une erreur.
     */
    private function conversionBytes(Media $media, string $conversion): ?string
    {
        if (! $media->hasGeneratedConversion($conversion)) {
            return null;
        }

        try {
            $path = $media->getPathRelativeToRoot($conversion);
        } catch (InvalidConversion) {
            return null;
        }

        $bytes = Storage::disk($media->conversions_disk)->get($path);

        return is_string($bytes) && $bytes !== '' ? $bytes : null;
    }

    /** L'original, lu par flux dans un fichier temporaire — la bibliothèque d'images exige un chemin. */
    private function reducedOriginal(Media $media, int $maxWidth): string
    {
        $in = Storage::disk($media->disk)->readStream($media->getPathRelativeToRoot());

        if (! is_resource($in)) {
            throw new \RuntimeException("média #{$media->getKey()} illisible sur le disque [{$media->disk}]");
        }

        $source = tempnam(sys_get_temp_dir(), 'pdf-img-');
        $target = $source.'.jpg';

        try {
            $out = fopen($source, 'wb');
            stream_copy_to_stream($in, $out);
            fclose($out);

            Image::useImageDriver(config('media-library.image_driver'))
                ->loadFile($source)
                ->fit(Fit::Max, $maxWidth, $maxWidth)
                ->quality(70)
                ->save($target);

            return (string) file_get_contents($target);
        } finally {
            if (is_resource($in)) {
                fclose($in);
            }
            @unlink($source);
            @unlink($target);
        }
    }

    private function encode(string $bytes): ?string
    {
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);

        if (! in_array($mime, self::MIME_TYPES, true)) {
            return null;
        }

        return "data:{$mime};base64,".base64_encode($bytes);
    }
}
