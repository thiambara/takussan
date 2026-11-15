<?php

namespace App\Services\Auth;

/**
 * TCK-2926 (ADR-0124 § 1) — la famille d'appareil et de navigateur d'un `User-Agent` : `iPhone · Safari`,
 * `Android · Chrome`, `Windows · Edge`. Une liste FERMÉE de familles : rien d'autre de la chaîne (versions,
 * modèle, langue) n'est retenu, et la chaîne elle-même n'est jamais stockée — elle identifierait l'appareil.
 *
 * Une moitié inconnue est omise (`Android`, `Firefox`) ; les deux inconnues, ou un robot, rendent `null`.
 */
final class FamilleDAppareil
{
    /** La chaîne lue au plus : au-delà, rien de ce que la liste reconnaît. */
    private const LONGUEUR_LUE = 512;

    public const SEPARATEUR = ' · ';

    /**
     * L'ordre compte : un iPad se dit aussi « Macintosh » (iPadOS), un Android « Linux ».
     *
     * @var list<array{0: string, 1: string}>
     */
    private const APPAREILS = [
        ['/\biPhone\b/', 'iPhone'],
        ['/\biPad\b/', 'iPad'],
        ['/\biPod\b/', 'iPod'],
        ['/\bAndroid\b/', 'Android'],
        ['/\bCrOS\b/', 'ChromeOS'],
        ['/\bWindows\b/', 'Windows'],
        ['/\bMacintosh\b|\bMac OS X\b/', 'Mac'],
        ['/\bLinux\b/', 'Linux'],
    ];

    /**
     * L'ordre compte : Edge, Opera et Samsung Internet se disent aussi « Chrome » ; Chrome se dit aussi « Safari ».
     *
     * @var list<array{0: string, 1: string}>
     */
    private const NAVIGATEURS = [
        ['/\bEdg(e|A|iOS)?\//', 'Edge'],
        ['/\bOPR\/|\bOpera\b/', 'Opera'],
        ['/\bSamsungBrowser\//', 'Samsung Internet'],
        ['/\bFirefox\/|\bFxiOS\//', 'Firefox'],
        ['/\bCriOS\/|\bChrome\//', 'Chrome'],
        ['/\bVersion\/[\d.]+.*\bSafari\/|\bMobile\/\w+ Safari\//', 'Safari'],
    ];

    /** Robots et clients sans navigateur : aucune famille, pour ne pas en écrire une fausse. */
    private const ROBOTS = '/bot\b|crawler|spider|curl\/|wget\/|python-requests|okhttp|^node$|undici/i';

    public static function lire(?string $userAgent): ?string
    {
        $agent = trim(mb_substr((string) $userAgent, 0, self::LONGUEUR_LUE));
        if ($agent === '' || preg_match(self::ROBOTS, $agent) === 1) {
            return null;
        }

        $parties = array_values(array_filter([
            self::premiere(self::APPAREILS, $agent),
            self::premiere(self::NAVIGATEURS, $agent),
        ]));

        return $parties === [] ? null : implode(self::SEPARATEUR, $parties);
    }

    /** @param  list<array{0: string, 1: string}>  $familles */
    private static function premiere(array $familles, string $agent): ?string
    {
        foreach ($familles as [$motif, $nom]) {
            if (preg_match($motif, $agent) === 1) {
                return $nom;
            }
        }

        return null;
    }
}
