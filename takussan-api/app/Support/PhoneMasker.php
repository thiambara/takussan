<?php

namespace App\Support;

use App\Support\Telephone\LectureDesNumeros;
use App\Support\Telephone\Politique;

/**
 * TCK-2383 (ADR-0076 §5) — masque les numéros d'un texte : tout ce que {@see LectureDesNumeros} lit sous
 * {@see Politique::Masquer} (sénégalais, étranger, lien `wa.me`, par excès) est remplacé par un jeton. Le texte rendu garde
 * tout ce qui n'est pas un numéro, caractères invisibles et chiffres non latins compris ; un numéro qui les enjambe est
 * remplacé en entier.
 *
 * Les motifs vivent dans le module de lecture depuis TCK-3004, privés : ce masqueur en est un usage, comme le Radar, la
 * recherche et l'anonymisation des jeux d'évaluation. `scripts/check-ai-evals-pii.mjs` reconnaît le même ensemble :
 * `tests/fixtures/ai/donnees-personnelles.json` éprouve les deux. Le jeton n'est pas un numéro plausible.
 *
 * Échoue fermé : sur une erreur PCRE (UTF-8 invalide) il purge puis relance, et lève plutôt que de rendre le texte brut.
 */
final class PhoneMasker
{
    public const TOKEN = '[TELEPHONE]';

    public static function mask(string $text): string
    {
        return self::maskValid($text) ?? self::maskValid(mb_scrub($text, 'UTF-8')) ?? throw new \RuntimeException('ai.phone_mask_failed');
    }

    /** Null si le texte n'est pas de l'UTF-8 valide ou si PCRE échoue. */
    private static function maskValid(string $text): ?string
    {
        $numeros = LectureDesNumeros::lire($text, Politique::Masquer);
        if ($numeros === null) {
            return null;
        }

        $out = '';
        $cursor = 0;
        foreach ($numeros as $numero) {
            $out .= substr($text, $cursor, $numero->debut - $cursor).self::TOKEN;
            $cursor = $numero->fin;
        }

        return $out.substr($text, $cursor);
    }
}
