<?php

namespace Tests\Support;

use Illuminate\Filesystem\Filesystem;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\ParallelTesting;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\Filesystem as Flysystem;
use League\Flysystem\Local\LocalFilesystemAdapter;

/**
 * TCK-539 — un disque DISTANT simulé, nommé comme en production (`r2-private`, `r2-media`).
 *
 * ⚠ **`Storage::fake('r2-private')` ne suffit PAS à prouver l'indépendance au disque.** Il rend
 * un disque LOCAL : `path()` y donne un chemin absolu qui existe, et `$media->getPath()` — le
 * défaut même que TCK-539 retire — y marche. Un test sur ce faux resterait vert après le retour
 * de `getPath()` : il n'éprouverait que le nom du disque.
 *
 * Ce faux-ci range les octets dans un répertoire temporaire, mais son `path()` rend, comme le
 * pilote S3, un chemin RELATIF (`12/cni.pdf`) qui n'existe sur aucun système de fichiers.
 * `response()->file()`, `file_get_contents()` et `Reader::createFromPath()` échouent donc dessus
 * exactement comme en production ; seul ce qui lit par le disque (`readStream`, `response`,
 * `temporaryUrl`) passe.
 *
 * Les URL présignées sont simulées (`https://r2.test/<disque>/<chemin>?expires=…&…`) : elles
 * portent le chemin, l'échéance et les options, de quoi en affirmer la durée et la disposition.
 *
 * ## Ce qu'il ne simule PAS de S3 / R2 — l'angle mort
 *
 * Il simule UNE propriété : « le fichier n'est pas à un chemin local ». Tout le reste est local :
 *   · **la visibilité** : pas d'ACL, pas de seau sans accès public. Un `url()` sur ce disque rend
 *     `/storage/…` et ne dit rien de ce qu'un navigateur obtiendrait de R2 ;
 *   · **la présignature réelle** : l'URL est fabriquée, jamais signée ni vérifiée ; les options
 *     (`ResponseContentType`, `ResponseContentDisposition`) sont recopiées, pas interprétées par R2,
 *     et R2 peut en ignorer certaines ;
 *   · **le réseau** : ni latence, ni coupure, ni `503`, ni lecture partielle. Un `readStream()` sur
 *     un gros fichier est une lecture de disque, pas un flux HTTP qui peut casser en route ;
 *   · **la cohérence et les métadonnées** : `mimeType()`, `size()`, `lastModified()` viennent du
 *     système de fichiers local, pas des en-têtes d'objet ; pas de répertoires en S3, alors
 *     qu'ici `deleteDirectory()` et `files()` se comportent comme sur un disque ;
 *   · **les identifiants et la région** : aucune configuration du disque réel n'est lue.
 *
 * Il prouve donc qu'un chemin **ne dépend pas d'un fichier local** — pas qu'il marche contre R2.
 * Ça, seule la préproduction le prouve (TCK-541).
 */
final class RemoteDiskFake
{
    public const PRESIGNED_HOST = 'https://r2.test';

    /**
     * Installe le faux et le branche sur media-library : `r2-media` devient le disque PUBLIC
     * (`public_disk_name`), tout autre nom le disque privé par défaut (`disk_name`).
     *
     * `$presigns: false` simule un disque qui ne sait pas émettre d'URL présignée.
     */
    public static function install(string $disk = 'r2-private', bool $presigns = true): FilesystemAdapter
    {
        $root = storage_path("framework/testing/disks/{$disk}-remote");

        if ($token = ParallelTesting::token()) {
            // Même suffixe que `Storage::fake()` : la purge de TestFilesystemIsolation le ramasse.
            $root = "{$root}_test_{$token}";
        }

        (new Filesystem)->ensureDirectoryExists($root);
        (new Filesystem)->cleanDirectory($root);

        $adapter = new LocalFilesystemAdapter($root);

        // Pas de `root` dans la configuration : c'est ce qui rend `path()` relatif, comme S3.
        $fake = new FilesystemAdapter(new Flysystem($adapter), $adapter, ['throw' => true]);

        if ($presigns) {
            // Le rappel est lié à l'adaptateur (`Closure::bind`) : `self::` y désignerait
            // FilesystemAdapter. L'hôte se capture par valeur.
            $host = self::PRESIGNED_HOST;

            $fake->buildTemporaryUrlsUsing(
                fn (string $path, \DateTimeInterface $expiration, array $options = []): string => "{$host}/{$disk}/{$path}?"
                    .http_build_query(['expires' => $expiration->getTimestamp()] + $options),
            );
        }

        Storage::set($disk, $fake);
        config([$disk === 'r2-media' ? 'media-library.public_disk_name' : 'media-library.disk_name' => $disk]);

        return $fake;
    }
}
