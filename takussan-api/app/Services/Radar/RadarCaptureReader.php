<?php

namespace App\Services\Radar;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\Exceptions\ImageException;
use Intervention\Image\ImageManager;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * TCK-2386, extrait par TCK-2388 — LES règles d'une capture d'écran du Radar, saisie d'annonce comme réponse
 * d'annonceur : budget de pixels lu dans l'en-tête AVANT tout décodage (422 `radar.captures.too_large`), image
 * illisible 422 `radar.captures.unreadable`, réencodage par GD (l'EXIF, position comprise, ne survit pas),
 * SHA-256 de l'ORIGINAL. `attach()` range sur le disque par défaut (privé) et efface les fichiers déjà écrits si
 * l'un échoue : la transaction rend les lignes, jamais les fichiers.
 *
 * Le type est relu dans les octets (`UploadedFile::getMimeType()`), jamais dans le nom ; la taille et le nombre sont
 * bornés par la requête (`config('radar.captures')`), les dimensions ici.
 */
final class RadarCaptureReader
{
    /**
     * Tout se lit et se réencode AVANT la moindre écriture : une image illisible ou démesurée refuse l'envoi entier,
     * sans ligne ni fichier orphelins.
     *
     * @param  list<UploadedFile>  $files
     * @return list<array{sha256: string, bytes: string, mime: string}>
     */
    public function prepare(array $files): array
    {
        $manager = new ImageManager(new GdDriver);
        $captures = [];
        foreach ($files as $file) {
            $original = (string) file_get_contents($file->getRealPath());
            $this->assertPixelBudget($original);
            $mime = (string) $file->getMimeType();
            try {
                $encoded = $manager->decodeBinary($original)->encodeUsingMediaType($mime)->toString();
            } catch (ImageException) {
                abort_code(422, 'radar.captures.unreadable');
            }
            $captures[] = ['sha256' => hash('sha256', $original), 'bytes' => $encoded, 'mime' => $mime];
        }

        return $captures;
    }

    /**
     * @param  list<array{sha256: string, bytes: string, mime: string}>  $captures
     * @return list<Media>
     */
    public function attach(HasMedia $model, string $collection, array $captures, string $filePrefix = 'capture'): array
    {
        $written = [];
        try {
            foreach ($captures as $i => $capture) {
                $extension = match ($capture['mime']) {
                    'image/png' => 'png',
                    'image/webp' => 'webp',
                    default => 'jpg',
                };
                $written[] = $model->addMediaFromString($capture['bytes'])
                    ->usingFileName(sprintf('%s-%d.%s', $filePrefix, $i + 1, $extension))
                    ->withCustomProperties(['sha256' => $capture['sha256']])
                    ->toMediaCollection($collection);
            }
        } catch (Throwable $e) {
            // La transaction rend les lignes, jamais les fichiers : ceux déjà écrits s'effacent ici.
            foreach ($written as $media) {
                Storage::disk($media->disk)->delete($media->getPathRelativeToRoot());
            }

            throw $e;
        }

        return $written;
    }

    /**
     * Les dimensions lues dans l'EN-TÊTE seul (`getimagesizefromstring`), avant que GD n'alloue
     * largeur × hauteur × 4 octets : 422 `radar.captures.too_large` au-delà des bornes.
     */
    private function assertPixelBudget(string $bytes): void
    {
        $size = @getimagesizefromstring($bytes);
        if ($size === false) {
            abort_code(422, 'radar.captures.unreadable');
        }

        [$width, $height] = $size;
        $maxSide = (int) config('radar.captures.max_side');
        abort_code_if(
            $width > $maxSide || $height > $maxSide || $width * $height > (int) config('radar.captures.max_pixels'),
            422,
            'radar.captures.too_large',
        );
    }
}
