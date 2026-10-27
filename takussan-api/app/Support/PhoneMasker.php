<?php

namespace App\Support;

/**
 * TCK-2383 (ADR-0076 §5) — masque les numéros sénégalais d'un texte, avec ou sans `+221`, `00221`
 * ou `221` nu, collés ou groupés (`77 123 45 67`, `77 12 34 567`, `338 21 00 00`, `77/123/45/67`…)
 * par espaces, espaces insécables, points, tirets ou barres obliques.
 *
 * Préfixes (TCK-2400) : ceux du plan de numérotage national de l'ARTP, communication du 6.IX.2022
 * publiée par l'UIT le 3.X.2023 (Bulletin d'exploitation, « Sénégal (indicatif de pays +221) ») —
 * fixe 30, 32, 33, 36, 39 ; mobile 70, 72, 75, 76, 77, 78, 79 ; VoIP 93. Plus 71, ajouté sur
 * décision du porteur (2026-10-27) bien que ce plan ne l'attribue pas encore. 34 n'y est pas.
 *
 * Avant le motif, les chiffres pleine chasse et arabes-indiens sont ramenés à l'ASCII et les
 * caractères invisibles (U+200B…) retirés, un code point pour un code point : le texte rendu garde
 * tout ce qui n'est pas un numéro. Un nombre suivi d'une marque monétaire (`F`, `FCFA`, `F CFA`,
 * `CFA`, `XOF`, `francs`) est un prix, pas un numéro ; un groupement 3-3-3 (`300 000 000`) aussi.
 *
 * `scripts/check-ai-evals-pii.mjs` reconnaît le même ensemble : `tests/fixtures/ai/donnees-personnelles.json`
 * éprouve les deux. Le jeton n'est pas un numéro plausible.
 * Échoue fermé : sur une erreur PCRE (UTF-8 invalide) il purge puis relance, et lève plutôt que de rendre le texte brut.
 */
final class PhoneMasker
{
    private const SEP = '[\s\x{00A0}\x{202F}.\-\/]';

    private const PREFIX = '(?:3[02369]|7[0-25-9]|93)';

    /**
     * S'applique au texte normalisé (`normalizeDigits()`, sans invisibles). Un séparateur facultatif
     * entre les groupes 2-3-2-2, 2-2-2-3 ou 3-2-2-2 : `750 000 000` (3-3-3) n'en est aucun.
     */
    public const PATTERN = '/(?<!\d)(?:(?:\+|00)?221'.self::SEP.'?)?'
        .'(?:'.self::PREFIX.self::SEP.'?(?:\d{3}'.self::SEP.'?\d{2}'.self::SEP.'?\d{2}|\d{2}'.self::SEP.'?\d{2}'.self::SEP.'?\d{3})'
        .'|'.self::PREFIX.'\d'.self::SEP.'?\d{2}'.self::SEP.'?\d{2}'.self::SEP.'?\d{2})'
        .'(?!\d)(?![\s\x{00A0}\x{202F}]*(?:f[\s\x{00A0}\x{202F}]?cfa|cfa|xof|francs?|f)(?!\p{L}))/iu';

    public const TOKEN = '[TELEPHONE]';

    /** Retirés avant le motif : « 77<ZWSP>123 45 67 » est un numéro. */
    public const INVISIBLE = '/[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}\x{00AD}]/u';

    /** Premier code point de chaque série de chiffres non ASCII ramenée à 0-9. */
    private const DIGIT_ZEROS = [0xFF10, 0x0660, 0x06F0];

    /** @var array<string, string>|null */
    private static ?array $digits = null;

    public static function mask(string $text): string
    {
        return self::maskValid($text) ?? self::maskValid(mb_scrub($text, 'UTF-8')) ?? throw new \RuntimeException('ai.phone_mask_failed');
    }

    /** Les chiffres pleine chasse et arabes-indiens en ASCII, un code point pour un code point. */
    public static function normalizeDigits(string $text): string
    {
        if (self::$digits === null) {
            self::$digits = [];
            foreach (self::DIGIT_ZEROS as $zero) {
                for ($i = 0; $i <= 9; $i++) {
                    self::$digits[mb_chr($zero + $i, 'UTF-8')] = (string) $i;
                }
            }
        }

        return strtr($text, self::$digits);
    }

    /** Null si le texte n'est pas de l'UTF-8 valide ou si PCRE échoue. */
    private static function maskValid(string $text): ?string
    {
        $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);
        if ($chars === false) {
            return null;
        }
        // Le texte normalisé, et pour chacun de ses code points l'indice du caractère d'origine.
        $normalized = '';
        $map = [];
        foreach ($chars as $index => $char) {
            if (preg_match(self::INVISIBLE, $char) === 1) {
                continue;
            }
            $normalized .= self::normalizeDigits($char);
            $map[] = $index;
        }
        if (preg_match_all(self::PATTERN, $normalized, $found, PREG_OFFSET_CAPTURE) === false) {
            return null;
        }

        $out = '';
        $cursor = 0;
        foreach ($found[0] as [$match, $byte]) {
            $first = mb_strlen(substr($normalized, 0, $byte), 'UTF-8');
            $start = $map[$first];
            $end = $map[$first + mb_strlen($match, 'UTF-8') - 1];
            $out .= implode('', array_slice($chars, $cursor, $start - $cursor)).self::TOKEN;
            $cursor = $end + 1;
        }

        return $out.implode('', array_slice($chars, $cursor));
    }
}
