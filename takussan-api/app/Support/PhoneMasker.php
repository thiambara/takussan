<?php

namespace App\Support;

/**
 * TCK-2383 (ADR-0076 §5) — masque les numéros sénégalais d'un texte : mobiles (70, 75, 76, 77, 78)
 * et fixes (33), avec ou sans `+221` / `00221`, collés ou séparés par espaces, points ou tirets.
 * Le jeton n'est pas un numéro plausible : `check-ai-evals-pii.mjs` ne le prend pas pour un.
 * Échoue fermé : sur une erreur PCRE (UTF-8 invalide) il purge puis relance, et lève plutôt que de rendre le texte brut.
 */
final class PhoneMasker
{
    public const PATTERN = '/(?<!\d)(?:(?:\+|00)221[\s\x{00A0}\x{202F}.\-]?)?(?:7[05678]|33)[\s\x{00A0}\x{202F}.\-]?\d{3}[\s\x{00A0}\x{202F}.\-]?\d{2}[\s\x{00A0}\x{202F}.\-]?\d{2}(?!\d)/u';

    public const TOKEN = '[TELEPHONE]';

    public static function mask(string $text): string
    {
        $masked = preg_replace(self::PATTERN, self::TOKEN, $text)
            ?? preg_replace(self::PATTERN, self::TOKEN, mb_scrub($text, 'UTF-8'));

        return $masked ?? throw new \RuntimeException('ai.phone_mask_failed');
    }
}
