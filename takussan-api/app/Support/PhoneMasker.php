<?php

namespace App\Support;

/**
 * TCK-2383 (ADR-0076 §5) — masque les numéros sénégalais d'un texte : mobiles (70, 75, 76, 77, 78)
 * et fixes (33), avec ou sans `+221` / `00221`, collés ou séparés par espaces, points ou tirets.
 * Le jeton n'est pas un numéro plausible : `check-ai-evals-pii.mjs` ne le prend pas pour un.
 */
final class PhoneMasker
{
    public const PATTERN = '/(?<!\d)(?:(?:\+|00)221[\s.\-]?)?(?:7[05678]|33)[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}(?!\d)/';

    public const TOKEN = '[TELEPHONE]';

    public static function mask(string $text): string
    {
        return preg_replace(self::PATTERN, self::TOKEN, $text) ?? $text;
    }
}
