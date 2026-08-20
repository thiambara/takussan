<?php

namespace App\Models\Enums;

use Intervention\Image\Alignment;

enum WatermarkPosition: string
{
    case BottomRight = 'bottom_right';
    case BottomLeft = 'bottom_left';
    case BottomCenter = 'bottom_center';

    public static function default(): self
    {
        return self::BottomRight;
    }

    /**
     * Alignement attendu par `ImageInterface::insert()`.
     *
     * Rend un `Alignment` et non plus une chaîne (TCK-319). `insert()` accepte les deux
     * (`string|Alignment`) et `Alignment::create()` résout même nos anciennes chaînes — dont
     * `'bottom-center'`, qui n'est PAS un cas de l'enum mais un de ses alias documentés, résolu
     * vers `Alignment::BOTTOM`. Vérifié dans le paquet installé, pas supposé.
     *
     * Le type reste néanmoins préférable : `Alignment::create()` sur une chaîne inconnue lève au
     * moment du filigrane, c'est-à-dire dans un job de file, sur la photo d'un client. Ici, un
     * `match` non exhaustif ne compile pas.
     */
    public function toInterventionPosition(): Alignment
    {
        return match ($this) {
            self::BottomRight => Alignment::BOTTOM_RIGHT,
            self::BottomLeft => Alignment::BOTTOM_LEFT,
            self::BottomCenter => Alignment::BOTTOM,
        };
    }
}
