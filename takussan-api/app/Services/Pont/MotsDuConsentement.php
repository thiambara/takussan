<?php

namespace App\Services\Pont;

use Normalizer;

/**
 * TCK-2980 (ADR-0132 § 3) — STOP, ARRET et START, EXACTS : la règle de `RadarWhatsappInbox::isStop` (le mot seul,
 * aux espaces, à la casse et à la ponctuation finale près), étendue aux trois mots, accents repliés (« Arrêt. »).
 * Tout autre texte, même un refus (« stop svp »), est un message ordinaire.
 */
final class MotsDuConsentement
{
    public const STOP = 'stop';

    public const START = 'start';

    /** @var array<string, string> mot replié => effet */
    private const MOTS = ['stop' => self::STOP, 'arret' => self::STOP, 'start' => self::START];

    /** L'effet du texte (`stop`, `start`), ou `null` : un message ordinaire. */
    public static function effet(?string $texte): ?string
    {
        if ($texte === null || preg_match('/^\s*(\p{L}+)\s*[.!?…]*\s*$/u', $texte, $m) !== 1) {
            return null;
        }

        return self::MOTS[self::replier($m[1])] ?? null;
    }

    private static function replier(string $mot): string
    {
        $decompose = Normalizer::normalize($mot, Normalizer::FORM_D);

        return mb_strtolower((string) preg_replace('/\p{Mn}+/u', '', $decompose === false ? $mot : $decompose));
    }
}
