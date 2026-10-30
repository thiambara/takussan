<?php

namespace App\Support;

/**
 * TCK-2392 — le texte que compare le quatrième signal de rapprochement (`RadarMatcher::SIGNAL_TEXT`).
 *
 * - **La description extraite d'abord**, le texte brut à défaut : le texte brut d'une page porte le décor du site (menus,
 *   mentions), qui diffère d'un site à l'autre pour la même annonce ; la description est ce que l'annonceur a écrit.
 * - **Replié** : minuscules, invisibles retirés, blancs repliés. **Sans aucun chiffre** : ni numéro de téléphone (ce texte
 *   est une donnée de calcul, il ne doit rien garder de ce que la purge efface ailleurs), ni prix qui ferait diverger deux
 *   textes identiques à une baisse près.
 * - **Borné** à {@see self::MAX_CHARS} caractères ; null sous {@see self::MIN_CHARS} : un texte trop court rapproche tout.
 */
final class RadarSimilarityText
{
    public const MAX_CHARS = 1000;

    public const MIN_CHARS = 60;

    /** @param  array<string, mixed>|null  $extracted */
    public static function of(?array $extracted, ?string $rawText): ?string
    {
        $description = $extracted['description']['value'] ?? null;
        $text = is_string($description) && mb_strlen(trim($description)) >= self::MIN_CHARS ? $description : $rawText;

        return self::fold($text);
    }

    public static function fold(?string $text): ?string
    {
        if ($text === null) {
            return null;
        }

        $text = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $text));
        $text = (string) preg_replace('/\d+/u', ' ', $text);
        $text = mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $text)));
        if (mb_strlen($text) < self::MIN_CHARS) {
            return null;
        }

        return mb_substr($text, 0, self::MAX_CHARS);
    }
}
