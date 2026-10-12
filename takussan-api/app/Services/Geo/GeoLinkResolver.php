<?php

namespace App\Services\Geo;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * TCK-633 (AC9) — suit un lien court Google Maps jusqu'à des coordonnées.
 *
 * Garde SSRF, à CHAQUE étape et pas seulement sur l'URL saisie :
 *   · https seulement, sans identifiants ni port ;
 *   · hôtes LUS : les domaines cartographiques de Google, chemins `/maps…` pour `google.com` et
 *     `google.sn`, `/maps/…` pour `goo.gl` ;
 *   · hôtes APPELÉS : les seuls hôtes de redirection (`maps.app.goo.gl`, `goo.gl`,
 *     `maps.google.com`, `maps.google.sn`) — une fiche `www.google.com` se lit, ne s'appelle pas ;
 *   · `consent.google.com` (serveurs en Europe) : on lit son paramètre `continue`, sans requête ;
 *   · aucune redirection suivie automatiquement, trois requêtes au plus, délais courts.
 */
final class GeoLinkResolver
{
    public const SAUTS_MAX = 3;

    /** @var list<string> */
    private const HOTES_LUS = [
        'maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'maps.google.sn',
        'www.google.com', 'google.com', 'www.google.sn', 'google.sn',
    ];

    /** @var list<string> */
    private const HOTES_APPELES = ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'maps.google.sn'];

    private const CONSENTEMENT = 'consent.google.com';

    private const AGENT = 'Mozilla/5.0 (compatible; takussan-geo/1.0; +https://www.takussan.com)';

    /** @return array{latitude: float, longitude: float}|null */
    public function resoudre(string $url): ?array
    {
        $courante = $url;
        $requetes = 0;

        for ($tour = 0; $tour < 2 * self::SAUTS_MAX + 2; $tour++) {
            $hote = $this->hoteAdmis($courante);
            if ($hote === null) {
                return null;
            }

            if ($hote === self::CONSENTEMENT) {
                parse_str((string) parse_url($courante, PHP_URL_QUERY), $parametres);
                $suite = $parametres['continue'] ?? null;
                if (! is_string($suite) || $suite === '') {
                    return null;
                }
                $courante = $suite;

                continue;
            }

            $lu = GoogleMapsCoordinates::depuisUrl($courante);
            if ($lu !== null) {
                return $lu;
            }

            if ($requetes >= self::SAUTS_MAX || ! in_array($hote, self::HOTES_APPELES, true)) {
                return null;
            }
            $requetes++;

            try {
                $reponse = Http::withOptions(['allow_redirects' => false, 'stream' => true])
                    ->withUserAgent(self::AGENT)
                    ->connectTimeout(2)
                    ->timeout(4)
                    ->get($courante);
            } catch (ConnectionException) {
                return null;
            }

            $location = $reponse->redirect() ? $reponse->header('Location') : '';
            if ($location === '') {
                return null;
            }
            $suivante = $this->absolue($courante, $location);
            if ($suivante === null) {
                return null;
            }
            $courante = $suivante;
        }

        return null;
    }

    private function hoteAdmis(string $url): ?string
    {
        $parties = parse_url($url);
        if (! is_array($parties) || ($parties['scheme'] ?? '') !== 'https') {
            return null;
        }
        if (isset($parties['user']) || isset($parties['pass']) || isset($parties['port'])) {
            return null;
        }

        $hote = strtolower((string) ($parties['host'] ?? ''));
        $chemin = (string) ($parties['path'] ?? '/');

        if ($hote === self::CONSENTEMENT) {
            return $hote;
        }
        if (! in_array($hote, self::HOTES_LUS, true)) {
            return null;
        }
        if ($hote === 'goo.gl' && ! str_starts_with($chemin, '/maps/')) {
            return null;
        }
        if (in_array($hote, ['www.google.com', 'google.com', 'www.google.sn', 'google.sn'], true) && ! str_starts_with($chemin, '/maps')) {
            return null;
        }

        return $hote;
    }

    private function absolue(string $base, string $location): ?string
    {
        if (str_starts_with($location, 'https://') || str_starts_with($location, 'http://')) {
            return $location;
        }
        if (str_starts_with($location, '//')) {
            return 'https:'.$location;
        }
        if (str_starts_with($location, '/')) {
            return 'https://'.parse_url($base, PHP_URL_HOST).$location;
        }

        return null;
    }
}
