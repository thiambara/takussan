<?php

namespace App\Services\Media;

use App\Models\Inventory;
use App\Models\MaintenanceRequest;
use App\Support\RelativeSignedUrl;
use DateTimeInterface;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\Mime\MimeTypes;

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
 *
 * TCK-2088 (P180.02, ADR-0029, amendement du 2026-10-23) — chacune sert aussi une CONVERSION, nommée
 * dans l'URL signée et prise dans {@see self::SERVABLE_CONVERSIONS}, pour qu'une vignette privée ne
 * charge plus l'original. La conversion vit sur le disque privé et sort par la même porte.
 */
class PrivateMediaAccess
{
    /** Durée de l'URL présignée du seau (ADR-0029 §2). */
    public const PRESIGNED_TTL_MINUTES = 5;

    /** Durée par défaut de l'URL d'API signée qu'une ressource émet. */
    public const SIGNED_ROUTE_TTL_MINUTES = 30;

    /**
     * TCK-2088 — par modèle puis par collection privée, les conversions que `media.private.show`
     * peut servir. Une conversion absente de la liste n'est jamais servie, même produite.
     *
     * @var array<class-string, array<string, list<string>>>
     */
    public const SERVABLE_CONVERSIONS = [
        Inventory::class => ['room_photos' => ['preview']],
        MaintenanceRequest::class => [
            'photos' => ['thumbnail'],
            'before_photos' => ['thumbnail'],
            'completion_photos' => ['thumbnail'],
        ],
    ];

    /**
     * URL d'API signée vers `media.private.show`. La signature EST l'autorisation : ne l'émettre
     * que dans une réponse déjà autorisée pour ce média. `$conversion` fait partie de l'URL
     * signée : la changer, ou l'ajouter à l'URL de l'original, casse la signature.
     */
    public function signedUrl(Media $media, ?DateTimeInterface $expiresAt = null, ?string $conversion = null): string
    {
        $parameters = ['media' => $media->getKey()];
        if ($conversion !== null) {
            $parameters['conversion'] = $conversion;
        }

        return RelativeSignedUrl::temporary(
            'media.private.show',
            $expiresAt ?? now()->addMinutes(self::SIGNED_ROUTE_TTL_MINUTES),
            $parameters,
        );
    }

    /**
     * L'URL signée de la conversion si la route peut la servir, sinon `null` : l'appelant retombe
     * alors sur l'original, le temps que la file la produise.
     */
    public function signedConversionUrl(Media $media, string $conversion): ?string
    {
        return $this->servesConversion($media, $conversion) ? $this->signedUrl($media, conversion: $conversion) : null;
    }

    /** La conversion figure dans la liste de la collection, et elle est produite. */
    public function servesConversion(Media $media, string $conversion): bool
    {
        $model = Relation::getMorphedModel($media->model_type) ?? $media->model_type;

        return in_array($conversion, self::SERVABLE_CONVERSIONS[$model][$media->collection_name] ?? [], true)
            && $media->hasGeneratedConversion($conversion);
    }

    /**
     * Redirige vers une URL présignée courte. Un disque qui ne sait pas en émettre (`public` en
     * développement) est servi en flux plutôt que de rendre une erreur.
     */
    public function redirect(Media $media, string $disposition = 'inline', ?string $conversion = null): RedirectResponse|StreamedResponse
    {
        [$disk, $path, $name, $mime] = $this->file($media, $conversion);

        if (! $disk->providesTemporaryUrls()) {
            return $this->stream($media, $disposition, $conversion);
        }

        return redirect()->away($disk->temporaryUrl(
            $path,
            now()->addMinutes(self::PRESIGNED_TTL_MINUTES),
            [
                'ResponseContentType' => $mime,
                'ResponseContentDisposition' => HeaderUtils::makeDisposition(
                    $disposition,
                    $name,
                    $this->asciiFallback($name),
                ),
            ],
        ));
    }

    public function stream(Media $media, string $disposition = 'inline', ?string $conversion = null): StreamedResponse
    {
        [$disk, $path, $name, $mime] = $this->file($media, $conversion);

        return $disk->response($path, $name, ['Content-Type' => $mime], $disposition);
    }

    /**
     * Le disque, le chemin relatif, le nom et le type du fichier servi : l'original, ou la
     * conversion nommée, sur le disque des conversions du média.
     *
     * @return array{0: Filesystem&FilesystemAdapter, 1: string, 2: string, 3: string}
     */
    private function file(Media $media, ?string $conversion): array
    {
        if ($conversion === null) {
            return [Storage::disk($media->disk), $media->getPathRelativeToRoot(), $media->file_name, (string) $media->mime_type];
        }

        $path = $media->getPathRelativeToRoot($conversion);
        $mime = MimeTypes::getDefault()->getMimeTypes(pathinfo($path, PATHINFO_EXTENSION))[0] ?? 'application/octet-stream';

        return [Storage::disk($media->conversions_disk ?: $media->disk), $path, basename($path), $mime];
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
