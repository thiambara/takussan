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
 * puis demande plusieurs Go. Où il cède dépend de la GD (TCK-1812, P180.04) :
 *   · dans l'image de l'API, la GD est EMBARQUÉE (`install-php-extensions gd`, `Dockerfile` ;
 *     `gd.so` porte `GD_BUNDLED` et importe `_emalloc`) : elle alloue par le gestionnaire de PHP, et
 *     le décodage meurt sur `memory_limit` (256M, `docker/php.ini`), en `Allowed memory size
 *     exhausted` — déduit de la lecture du binaire, non exécuté dans le conteneur ;
 *   · sur un poste dont PHP lie une GD EXTERNE (Homebrew, `GD Version` 2.3.x), elle alloue hors du
 *     gestionnaire, `memory_limit` ne l'arrête pas, et c'est la mémoire de la machine qui cède
 *     (mesure de P10.02, prise sur un tel poste).
 * Dans les deux cas, la requête ou le job meurent : la borne vaut pour l'un comme pour l'autre.
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
