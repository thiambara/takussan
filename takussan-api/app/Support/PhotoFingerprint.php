<?php

namespace App\Support;

/**
 * TCK-597 (ADR-0054 §1, §2) — le dHash 64 bits d'une image, ses quatre bandes, et la distance.
 *
 * L'image est réduite à 9×8 en niveaux de gris ; chaque ligne donne 8 bits, un par couple de
 * pixels voisins (1 quand le pixel de gauche est plus clair que celui de droite). GD seul : il est
 * déjà chargé par le filigrane, et le cas visé — la MÊME photo republiée — ne demande pas plus.
 */
final class PhotoFingerprint
{
    /** Distance de Hamming au-delà de laquelle deux photos ne sont pas « la même ». */
    public const THRESHOLD = 3;

    /** L'empreinte, ou `null` si les octets ne se décodent pas en image. */
    public static function fromBinary(string $binary): ?int
    {
        $source = @imagecreatefromstring($binary);
        if ($source === false) {
            return null;
        }

        $small = imagecreatetruecolor(9, 8);
        imagecopyresampled($small, $source, 0, 0, 0, 0, 9, 8, imagesx($source), imagesy($source));
        imagedestroy($source);

        $hash = 0;
        for ($y = 0; $y < 8; $y++) {
            for ($x = 0; $x < 8; $x++) {
                $hash = ($hash << 1) | (self::luminance($small, $x, $y) > self::luminance($small, $x + 1, $y) ? 1 : 0);
            }
        }
        imagedestroy($small);

        return $hash;
    }

    /** @return array{0: int, 1: int, 2: int, 3: int} les quatre tranches de 16 bits */
    public static function bands(int $hash): array
    {
        return [
            ($hash >> 48) & 0xFFFF,
            ($hash >> 32) & 0xFFFF,
            ($hash >> 16) & 0xFFFF,
            $hash & 0xFFFF,
        ];
    }

    public static function distance(int $a, int $b): int
    {
        return substr_count(decbin($a ^ $b), '1');
    }

    private static function luminance(\GdImage $image, int $x, int $y): float
    {
        $rgb = imagecolorat($image, $x, $y);

        return 0.299 * (($rgb >> 16) & 0xFF) + 0.587 * (($rgb >> 8) & 0xFF) + 0.114 * ($rgb & 0xFF);
    }
}
