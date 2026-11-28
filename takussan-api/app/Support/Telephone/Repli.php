<?php

namespace App\Support\Telephone;

/**
 * TCK-3004 — le repli d'un texte avant toute lecture de ses chiffres : caractères invisibles retirés (« 77<ZWSP>123 45 67 »
 * est un numéro), chiffres non ASCII et `+` pleine chasse ramenés à l'ASCII, un code point pour un code point.
 *
 * Distinct de la lecture des numéros ({@see LectureDesNumeros}) : `RadarListingIntake::foldText()`, `RadarSimilarityText` et
 * `ExtractionNormalizer` replient un texte sans y chercher de numéro. Le premier alimente `radar_listings.content_fingerprint`
 * (unique) : ce repli ne change pas d'un octet sans que les empreintes stockées changent avec lui (`EmpreintesFigeesTest`).
 * Un texte qui n'est pas de l'UTF-8 valide se replie en rien, comme depuis toujours.
 *
 * Le miroir JS (`normaliser()` de `scripts/check-ai-evals-pii.mjs`) lit les mêmes ensembles.
 */
final class Repli
{
    /** Retirés avant tout motif. */
    private const INVISIBLE = '/[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}\x{00AD}]/u';

    /**
     * Premier code point de chaque série de chiffres non ASCII ramenée à 0-9 : pleine chasse, arabes-indiens,
     * indo-aryens et d'Asie du Sud-Est, N'Ko, mathématiques. Un chiffre qu'aucun motif ne lit est un numéro qui passe.
     */
    private const DIGIT_ZEROS = [
        0xFF10, 0x0660, 0x06F0, 0x07C0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6,
        0x0D66, 0x0E50, 0x0ED0, 0x0F20, 0x1040, 0x17E0, 0x1810, 0x1D7CE, 0x1D7D8, 0x1D7E2, 0x1D7EC, 0x1D7F6,
    ];

    /** Le `+` et les séparateurs écrits en pleine chasse ou en forme de petite capitale, un code point pour un. */
    private const PUNCTUATION = [0xFF0B => '+', 0xFE62 => '+', 0xFF0D => '-', 0xFF0E => '.', 0xFF0F => '/'];

    /** @var array<string, string>|null */
    private static ?array $table = null;

    public static function texte(string $texte): string
    {
        return strtr((string) preg_replace(self::INVISIBLE, '', $texte), self::table());
    }

    /** @return array<string, string> */
    private static function table(): array
    {
        if (self::$table === null) {
            self::$table = [];
            foreach (self::DIGIT_ZEROS as $zero) {
                for ($i = 0; $i <= 9; $i++) {
                    self::$table[mb_chr($zero + $i, 'UTF-8')] = (string) $i;
                }
            }
            foreach (self::PUNCTUATION as $code => $ascii) {
                self::$table[mb_chr($code, 'UTF-8')] = $ascii;
            }
        }

        return self::$table;
    }
}
