<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use SplFileInfo;

/**
 * TCK-677 (P10.02) — une image de plus de 20 Mpx est refusée sur son EN-TÊTE, sans être décodée.
 *
 * La miniature des photos de bien et des avatars est synchrone (`nonQueued`), et GD décode l'image
 * entière avant de la réduire : un PNG uni de 20 000 × 20 000 pèse quelques Ko, passe `max:10240`,
 * puis demande plusieurs Go. GD alloue hors du gestionnaire de mémoire de PHP, si bien que
 * `memory_limit` ne l'arrête pas : c'est la mémoire du conteneur qui cède (mesure de P10.02).
 *
 * `getimagesize()` ne lit que l'en-tête. La borne porte sur le PRODUIT largeur × hauteur, qui
 * gouverne la mémoire du décodage, et non sur chaque côté. Une image dont l'en-tête est illisible
 * passe ici : la juger revient à `image` et `mimes`, posées à côté.
 */
class PixelsAuPlus implements ValidationRule
{
    /** Décision du porteur : « refus au-delà de 20 Mpx ». */
    public const MAXIMUM = 20_000_000;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $value instanceof SplFileInfo) {
            return;
        }

        $chemin = $value->getRealPath();
        $dimensions = $chemin === false ? false : @getimagesize($chemin);
        if ($dimensions === false) {
            return;
        }

        if ($dimensions[0] * $dimensions[1] > self::MAXIMUM) {
            $fail('validation.dimensions')->translate();
        }
    }
}
