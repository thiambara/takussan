<?php

namespace App\Services\Media;

use DateTimeInterface;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TCK-539 — la seule porte de sortie d'un fichier privé, quel que soit son disque (ADR-0029 §2).
 *
 * Tout passe par `Storage::disk($media->disk)` et le chemin RELATIF au disque. Jamais
 * `$media->getPath()` : sur `r2-private` il rend un chemin qui n'existe sur aucun système de
 * fichiers, et `response()->file()` / `file_get_contents()` meurent dessus. Jamais non plus
 * `getFullUrl()` / `getTemporaryUrl()` de Spatie : ils passent par `CdnUrlGenerator`, qui
 * réécrirait une URL privée vers le CDN si celui-ci était réactivé.
 *
 * Trois formes, choisies par l'appelant APRÈS sa décision d'autorisation :
 *   - `redirect()` : URL présignée de 5 minutes — les octets ne traversent pas le VPS ;
 *   - `stream()`   : flux servi par l'API — quand chaque lecture doit repasser par elle ;
 *   - `signedUrl()`: URL d'API signée qu'une ressource JSON émet à la place de l'URL du fichier.
 */
class PrivateMediaAccess
{
    /** Durée de l'URL présignée du seau (ADR-0029 §2). */
    public const PRESIGNED_TTL_MINUTES = 5;

    /** Durée par défaut de l'URL d'API signée qu'une ressource émet. */
    public const SIGNED_ROUTE_TTL_MINUTES = 30;

    /**
     * URL d'API signée vers `media.private.show`. La signature EST l'autorisation : ne l'émettre
     * que dans une réponse déjà autorisée pour ce média.
     */
    public function signedUrl(Media $media, ?DateTimeInterface $expiresAt = null): string
    {
        return URL::temporarySignedRoute(
            'media.private.show',
            $expiresAt ?? now()->addMinutes(self::SIGNED_ROUTE_TTL_MINUTES),
            ['media' => $media->getKey()],
        );
    }

    /**
     * Redirige vers une URL présignée courte. Un disque qui ne sait pas en émettre (`public` en
     * développement) est servi en flux plutôt que de rendre une erreur.
     */
    public function redirect(Media $media, string $disposition = 'inline'): RedirectResponse|StreamedResponse
    {
        $disk = Storage::disk($media->disk);

        if (! $disk->providesTemporaryUrls()) {
            return $this->stream($media, $disposition);
        }

        return redirect()->away($disk->temporaryUrl(
            $media->getPathRelativeToRoot(),
            now()->addMinutes(self::PRESIGNED_TTL_MINUTES),
            [
                'ResponseContentType' => $media->mime_type,
                'ResponseContentDisposition' => HeaderUtils::makeDisposition(
                    $disposition,
                    $media->file_name,
                    $this->asciiFallback($media->file_name),
                ),
            ],
        ));
    }

    public function stream(Media $media, string $disposition = 'inline'): StreamedResponse
    {
        return Storage::disk($media->disk)->response(
            $media->getPathRelativeToRoot(),
            $media->file_name,
            ['Content-Type' => $media->mime_type],
            $disposition,
        );
    }

    /**
     * Pour une bibliothèque qui exige un chemin local : copie le fichier dans un fichier
     * temporaire, passe son chemin à `$callback`, et le supprime quoi qu'il arrive.
     *
     * ⚠ `$callback` doit avoir FINI de lire quand il rend la main : un générateur rendu tel quel
     * lirait après la suppression. Consommer l'itérable à l'intérieur.
     *
     * @template T
     *
     * @param  callable(string): T  $callback
     * @return T
     */
    public function withLocalCopy(Media $media, callable $callback): mixed
    {
        $tmp = tempnam(sys_get_temp_dir(), 'media-');

        if ($tmp === false) {
            throw new RuntimeException("Impossible de créer un fichier temporaire pour le média #{$media->getKey()}.");
        }

        try {
            $in = Storage::disk($media->disk)->readStream($media->getPathRelativeToRoot());

            if ($in === null) {
                throw new RuntimeException("Média #{$media->getKey()} illisible sur le disque « {$media->disk} ».");
            }

            $out = fopen($tmp, 'wb');

            try {
                stream_copy_to_stream($in, $out);
            } finally {
                fclose($in);
                fclose($out);
            }

            return $callback($tmp);
        } finally {
            if (is_file($tmp)) {
                unlink($tmp);
            }
        }
    }

    private function asciiFallback(string $filename): string
    {
        return str_replace(['/', '\\', '%'], '-', Str::ascii($filename));
    }
}
