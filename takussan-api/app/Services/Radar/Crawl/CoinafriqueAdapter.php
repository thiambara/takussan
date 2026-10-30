<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarSourceSite;
use App\Services\Radar\RadarAmountParser;
use DOMElement;
use GuzzleHttp\Psr7\Query;

/**
 * TCK-2392 — les pages de liste de CoinAfrique (structure relevée le 2026-10-30 sur une page publique, sans en garder le
 * contenu ; les fixtures des tests sont écrites à la main).
 *
 * - **Une carte** = un `div.ad__card`. L'URL de l'annonce est le lien de son image ou de sa description
 *   (`/annonce/<catégorie>/<slug>-<id>`, relative) ; le prix est le texte de `p.ad__card-price` (« 1 500 000 CFA »,
 *   lu par `RadarAmountParser`), le titre celui de `p.ad__card-description`, le lieu celui de `p.ad__card-location`. La
 *   catégorie du chemin donne le type (« appartements » → `apartment`) ; la carte ne dit pas le contrat.
 * - **La page suivante** : le lien `?page=N+1` de `ul.pagination`, résolu contre la page lue. PAS le `link[rel=next]` :
 *   il pointe vers la racine du site (`/?page=2`), que son `robots.txt` interdit.
 */
final class CoinafriqueAdapter implements RadarSiteAdapter
{
    use ReadsListHtml;

    private const DOMAIN = 'coinafrique.com';

    public function site(): RadarSourceSite
    {
        return RadarSourceSite::Coinafrique;
    }

    public function startUrl(): string
    {
        return (string) config('radar.crawl.sites.coinafrique.start_url');
    }

    /** TCK-2438 — Le seul site sénégalais : les autres pays de CoinAfrique sont hors du Radar. */
    public function startHosts(): array
    {
        return ['sn.coinafrique.com'];
    }

    public function parse(string $html, string $pageUrl): ListPage
    {
        $xpath = $this->xpath($html);

        $cards = [];
        foreach ($xpath->query('//div['.self::hasClass('ad__card').']') ?: [] as $card) {
            $href = $this->firstAttribute($xpath, './/a['.self::hasClass('ad__card-image').']', 'href', $card)
                ?? $this->firstAttribute($xpath, './/p['.self::hasClass('ad__card-description').']//a', 'href', $card);
            $url = $href === null ? null : self::absolute($href, $pageUrl);
            $path = (string) parse_url((string) $url, PHP_URL_PATH);
            if ($url === null || ! self::onDomain($url, self::DOMAIN) || preg_match('#^/annonce/([^/]+)/[^/]+#', $path, $m) !== 1) {
                continue;
            }

            $title = $this->firstText($xpath, './/p['.self::hasClass('ad__card-description').']', $card);
            $priceText = $this->firstText($xpath, './/p['.self::hasClass('ad__card-price').']', $card);
            $parsed = $priceText === null ? null : RadarAmountParser::parse($priceText);

            $cards[$url] ??= new ListCard(
                url: $url,
                title: $title,
                price: $parsed['amount'] ?? null,
                rentPeriod: $parsed['period'] ?? null,
                contract: self::contractFromWords($title),
                propertyType: self::typeFromWords($m[1]),
                surfaceM2: self::surfaceFrom($title),
                bedrooms: self::bedroomsFrom($title),
                location: $this->firstText($xpath, './/p['.self::hasClass('ad__card-location').']//span', $card)
                    ?? $this->firstText($xpath, './/p['.self::hasClass('ad__card-location').']', $card),
            );
        }

        return new ListPage(array_values($cards), $this->nextPage($xpath, $pageUrl));
    }

    private function nextPage(\DOMXPath $xpath, string $pageUrl): ?string
    {
        $current = (int) (Query::parse((string) parse_url($pageUrl, PHP_URL_QUERY))['page'] ?? 1);
        $wanted = max(1, $current) + 1;

        foreach ($xpath->query('//ul['.self::hasClass('pagination').']//a[@href]') ?: [] as $anchor) {
            if (! $anchor instanceof DOMElement) {
                continue;
            }
            $url = self::absolute($anchor->getAttribute('href'), $pageUrl);
            $page = (int) (Query::parse((string) parse_url((string) $url, PHP_URL_QUERY))['page'] ?? 0);
            if ($url !== null && $page === $wanted && self::onDomain($url, self::DOMAIN)) {
                return $url;
            }
        }

        return null;
    }
}
