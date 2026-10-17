<?php

namespace App\Services\Media;

use Illuminate\Http\UploadedFile;
use Spatie\Image\Enums\ImageDriver;
use Spatie\Image\Image;

/**
 * TCK-762 (P10.05) — un avatar est réencodé avant d'entrer dans la médiathèque.
 *
 * L'avatar vit sur le disque PUBLIC (ADR-0029 §3) : déposé tel quel, son original gardait l'EXIF
 * d'un selfie, position GPS comprise, lisible par quiconque connaît l'URL. Décodé puis réencodé
 * par GD, le fichier ne garde que ses pixels : GD n'écrit aucun segment de métadonnées.
 *
 * `loadFile()` applique l'orientation EXIF aux pixels avant de la perdre (`autoRotate`) : sans
 * cela, un selfie pris téléphone tenu droit ressortirait couché, puisque le navigateur n'aurait
 * plus le marqueur qui le redresse.
 *
 * Le format reste celui du fichier (jpg, png ou webp, seuls admis par `UpdateProfileRequest`),
 * deviné sur son contenu et non sur le nom qu'en donne le client.
 */
final class AvatarReencode
{
    public const QUALITE = 90;

    /**
     * Rend le chemin d'un fichier temporaire réencodé ; `addMedia()` le déplace ensuite dans la
     * médiathèque, qui le retire de là.
     */
    public static function sansMetadonnees(UploadedFile $fichier): string
    {
        $extension = $fichier->guessExtension() ?? 'jpg';
        $cible = tempnam(sys_get_temp_dir(), 'avatar').'.'.$extension;

        Image::useImageDriver(ImageDriver::Gd)
            ->loadFile((string) $fichier->getRealPath())
            ->quality(self::QUALITE)
            ->save($cible);

        return $cible;
    }

    /** Le nom de fichier rangé : celui du client, avec l'extension du contenu réel. */
    public static function nomDeFichier(UploadedFile $fichier): string
    {
        return pathinfo($fichier->getClientOriginalName(), PATHINFO_FILENAME).'.'.($fichier->guessExtension() ?? 'jpg');
    }
}
