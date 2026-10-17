<?php

namespace Tests\Support;

use Illuminate\Http\UploadedFile;

/**
 * TCK-677 (P10.02) — une image réduite à son en-tête, qui annonce les dimensions voulues sans les
 * pixels. `getimagesize()` la lit, finfo la reconnaît (la règle `image` passe), et aucun test n'a
 * besoin d'allouer des centaines de mégaoctets pour éprouver une borne de pixels. GD, lui, ne sait
 * pas la décoder : c'est le cas d'une bombe de décompression avant qu'elle n'explose.
 */
final class ImageEnTete
{
    public static function png(int $largeur, int $hauteur, string $nom = 'image.png'): UploadedFile
    {
        $ihdr = 'IHDR'.pack('NN', $largeur, $hauteur)."\x08\x02\x00\x00\x00";
        $contenu = "\x89PNG\r\n\x1a\n"
            .pack('N', 13).$ihdr.pack('N', crc32($ihdr))
            .pack('N', 0).'IEND'.pack('N', crc32('IEND'));

        return self::fichier($contenu, $nom, 'image/png');
    }

    public static function jpeg(int $largeur, int $hauteur, string $nom = 'image.jpg'): UploadedFile
    {
        $contenu = "\xFF\xD8"
            ."\xFF\xC0".pack('n', 17)."\x08".pack('nn', $hauteur, $largeur)
            ."\x03\x01\x22\x00\x02\x11\x01\x03\x11\x01"
            ."\xFF\xD9";

        return self::fichier($contenu, $nom, 'image/jpeg');
    }

    /**
     * TCK-751 (P10.06) — un HEIC réduit à sa boîte `ftyp` : finfo le reconnaît (`image/heic`), la
     * règle `image` de Laravel 13 l'accepte, et GD ne sait pas le décoder.
     */
    public static function heic(string $nom = 'image.heic'): UploadedFile
    {
        $contenu = pack('N', 24).'ftypheic'.pack('N', 0).'mif1heic'.str_repeat("\x00", 64);

        return self::fichier($contenu, $nom, 'image/heic');
    }

    /**
     * TCK-762 (P10.05) — un vrai JPEG, décodable par GD, qui porte un segment EXIF avec
     * `Orientation` et un bloc GPS (`GPSLatitudeRef = N`) : ce qu'un selfie de téléphone publie.
     */
    public static function jpegAvecExif(int $largeur, int $hauteur, int $orientation = 1, string $nom = 'selfie.jpg'): UploadedFile
    {
        $image = imagecreatetruecolor($largeur, $hauteur);
        imagefilledrectangle($image, 0, 0, intdiv($largeur, 2), $hauteur, (int) imagecolorallocate($image, 200, 40, 40));
        ob_start();
        imagejpeg($image, null, 90);
        $jpeg = (string) ob_get_clean();

        // TIFF gros-boutiste : IFD0 en 8 (Orientation, puis le pointeur GPS), IFD GPS en 38.
        $tiff = "MM\x00\x2A".pack('N', 8)
            .pack('n', 2)
            .pack('nnN', 0x0112, 3, 1).pack('n', $orientation)."\x00\x00"
            .pack('nnNN', 0x8825, 4, 1, 38)
            .pack('N', 0)
            .pack('n', 1)
            .pack('nnN', 0x0001, 2, 2)."N\x00\x00\x00"
            .pack('N', 0);
        $app1 = "\xFF\xE1".pack('n', strlen($tiff) + 8)."Exif\x00\x00".$tiff;

        return self::fichier(substr($jpeg, 0, 2).$app1.substr($jpeg, 2), $nom, 'image/jpeg');
    }

    private static function fichier(string $contenu, string $nom, string $mime): UploadedFile
    {
        $chemin = tempnam(sys_get_temp_dir(), 'tck677');
        file_put_contents($chemin, $contenu);

        return new UploadedFile($chemin, $nom, $mime, null, true);
    }
}
