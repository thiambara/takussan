<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarSourceSite;
use DOMElement;

/**
 * TCK-2392 — les pages de liste d'Expat-Dakar (structure relevée le 2026-10-30 sur une page publique, sans en garder le
 * contenu ; les fixtures des tests sont écrites à la main).
 *
 * - **Une carte** = un `article.tw-sr-card`. Son lien `a.tw-sr-card__title-link` porte l'URL de l'annonce
 *   (`/annonce/<slug>-<id>`), le titre en texte, et des attributs de mesure d'audience qui donnent le prix
 *   (`data-t-listing_price`, `data-t-listing_currency`), le lieu (`data-t-listing_location_title`) et la catégorie
 *   (`data-t-listing_category_slug`, « appartements-a-louer » → `apartment`, `rent`). Les pastilles `li.tw-sr-chip`
 *   montrent chambres et surface.
 * - Les annonces mises en avant sont répétées dans un carrousel : la même URL n'est rendue qu'une fois.
 * - **La page suivante** : `link[rel=next]` (`?page=N`), sur le même site seulement.
 */
final class ExpatDakarAdapter implements RadarSiteAdapter
{
    use ReadsListHtml;

    private const DOMAIN = 'expat-dakar.com';

    public function site(): RadarSourceSite
    {
        return RadarSourceSite::ExpatDakar;
    }

    public function startUrl(): string
    {
        return (string) config('radar.crawl.sites.expat_dakar.start_url');
    }

    public function parse(string $html, string $pageUrl): ListPage
    {
        $xpath = $this->xpath($html);

        $cards = [];
        foreach ($xpath->query('//article['.self::hasClass('tw-sr-card').']') ?: [] as $article) {
            $link = $xpath->query('.//a['.self::hasClass('tw-sr-card__title-link').']', $article)?->item(0);
            if (! $link instanceof DOMElement) {
                continue;
            }

            $url = self::absolute($link->getAttribute('href'), $pageUrl);
            if ($url === null || ! self::onDomain($url, self::DOMAIN) || ! str_starts_with((string) parse_url($url, PHP_URL_PATH), '/annonce/')) {
                continue;
            }

            $chips = implode(' · ', array_filter(array_map(
                fn ($chip) => self::squish($chip->textContent),
                iterator_to_array($xpath->query('.//li['.self::hasClass('tw-sr-chip').']', $article) ?: []),
            )));
            $category = $link->getAttribute('data-t-listing_category_slug');

            $cards[$url] ??= new ListCard(
                url: $url,
                title: self::squish($link->textContent),
                price: self::price($link->getAttribute('data-t-listing_price'), $link->getAttribute('data-t-listing_currency')),
                contract: self::contractFromWords($category),
                propertyType: self::typeFromWords($category),
                surfaceM2: self::surfaceFrom($chips),
                bedrooms: self::bedroomsFrom($chips),
                location: self::squish($link->getAttribute('data-t-listing_location_title'))
                    ?? $this->firstText($xpath, './/p['.self::hasClass('tw-sr-card__location').']', $article),
            );
        }

        $next = $this->firstAttribute($xpath, '//link[@rel="next"]', 'href') ?? $this->firstAttribute($xpath, '//a[@rel="next"]', 'href');
        $next = $next === null ? null : self::absolute($next, $pageUrl);

        return new ListPage(array_values($cards), $next !== null && self::onDomain($next, self::DOMAIN) ? $next : null);
    }

    /** « 87000000.00 » en XOF → 87 000 000 ; une autre monnaie, ou un montant nul ou illisible → null. */
    private static function price(string $amount, string $currency): ?int
    {
        if (strtoupper(trim($currency)) !== 'XOF' || preg_match('/^\d{1,13}(\.\d{1,2})?$/', trim($amount)) !== 1) {
            return null;
        }
        $value = (int) explode('.', trim($amount))[0];

        return $value > 0 ? $value : null;
    }
}
