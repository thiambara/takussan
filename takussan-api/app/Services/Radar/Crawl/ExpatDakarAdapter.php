<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarSourceSite;
use Carbon\CarbonImmutable;
use DOMElement;
use DOMXPath;
use Throwable;

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
 *
 * TCK-2465 (ADR-0087 §1) — **la page d'une annonce** (structure relevée le 2026-11-04) :
 * - le `dataLayer.push({...})` porte `listing_price`, `listing_currency`, `listing_location_title`,
 *   `listing_category_slug` (repli : les attributs `data-t-listing_*` du lien d'appel) ;
 * - le numéro de l'annonceur : `tel:`, `whatsapp://send?phone=`, `data-whatsapp="https://wa.me/…"`. Le JSON-LD
 *   `Organization.telephone` (et `contactPoint`) est le numéro du SITE (`+221 76 6448613`) : jamais rendu ;
 * - la galerie : `ul.gallery--main img`, la plus grande taille du `srcset` (`listing-gallery-full-1920w`), sur
 *   `i.roamcdn.net`. Les `og:image` sont des variantes filigranées : jamais prises ;
 * - la date : le DOM ne dit qu'un relatif (« Aujourd'hui, 10:06 », une remontée) et `ItemPage.datePublished` vaut l'heure
 *   du rendu ; `Product.offers.validFrom` est la seule date absolue de mise en ligne (heure de Dakar = UTC) ;
 * - le lieu : `listing-item__address-location` (le quartier) et `listing-item__address-region` (la région, rangée en
 *   ville) ; le vendeur : le bloc `listing-item-transparency` (nom, « Membre depuis … », « Vérifié via : … »).
 *
 * TCK-2467 (ADR-0087 §4) — **les sitemaps** (relevé du 2026-11-04) : `robots.txt` déclare `sitemap-listings-index-fr.xml`,
 * qui liste un `sitemap-listings-<catégorie>-fr.xml` par catégorie (`<loc>`, `<lastmod>`, `<image:loc>` par annonce,
 * `application/xml`). Les neuf catégories immobilières sont déclarées ici ({@see self::SITEMAP_CATEGORIES}) ;
 * `promoteurs-immobiliers` et `services-agence-immobiliere` (des services, pas des biens) sont écartées.
 */
final class ExpatDakarAdapter implements RadarSiteAdapter
{
    use ReadsListHtml;

    private const DOMAIN = 'expat-dakar.com';

    /** TCK-2465 — l'hôte des photos d'une annonce (relevé du 2026-11-04). */
    private const PHOTO_HOSTS = ['i.roamcdn.net'];

    /** TCK-2465 — le numéro du site (JSON-LD `Organization.telephone`, « Service commercial »). */
    private const SITE_PHONES = ['+221766448613'];

    /**
     * TCK-2467 — les catégories immobilières à sitemap, et ce que chacune dit de ses annonces. Le contrat d'un meublé
     * n'est pas dit par la catégorie (comme pour une carte de liste) ; le type d'une propriété commerciale non plus
     * (boutique, bureau ou entrepôt).
     *
     * @var array<string, array{type: ?string, contract: ?string}>
     */
    private const SITEMAP_CATEGORIES = [
        'appartements-a-louer' => ['type' => 'apartment', 'contract' => 'rent'],
        'appartements-a-vendre' => ['type' => 'apartment', 'contract' => 'sale'],
        'appartements-meubles' => ['type' => 'apartment', 'contract' => null],
        'chambres-a-louer' => ['type' => 'room', 'contract' => 'rent'],
        'maisons-a-louer' => ['type' => 'house', 'contract' => 'rent'],
        'maisons-a-vendre' => ['type' => 'house', 'contract' => 'sale'],
        'terrains-a-vendre' => ['type' => 'land', 'contract' => 'sale'],
        'proprietes-commerciales-a-louer' => ['type' => null, 'contract' => 'rent'],
        'proprietes-commerciales-a-vendre' => ['type' => null, 'contract' => 'sale'],
    ];

    private const SITEMAP_URL = 'https://www.expat-dakar.com/sitemap-listings-%s-fr.xml';

    public function site(): RadarSourceSite
    {
        return RadarSourceSite::ExpatDakar;
    }

    public function startUrl(): string
    {
        return (string) config('radar.crawl.sites.expat_dakar.start_url');
    }

    /** TCK-2438 — Le site, avec ou sans `www`. */
    public function startHosts(): array
    {
        return ['www.expat-dakar.com', 'expat-dakar.com'];
    }

    public function excludedPhones(): array
    {
        return self::SITE_PHONES;
    }

    public function sitemapUrls(): array
    {
        return array_map(fn (string $category) => sprintf(self::SITEMAP_URL, $category), array_keys(self::SITEMAP_CATEGORIES));
    }

    public function sitemapCategory(string $sitemapUrl): array
    {
        foreach (self::SITEMAP_CATEGORIES as $category => $card) {
            if (strcasecmp($sitemapUrl, sprintf(self::SITEMAP_URL, $category)) === 0) {
                return $card;
            }
        }

        return ['type' => null, 'contract' => null];
    }

    public function parseListing(string $html, string $pageUrl): ?ListingPage
    {
        $xpath = $this->xpath($html);
        $product = $this->product($xpath);

        $description = self::paragraphs($xpath->query('(//div['.self::hasClass('listing-item__description').'])[1]')?->item(0))
            ?? self::cleanParagraphs(is_string($product['description'] ?? null) ? $product['description'] : null);
        if ($description === null) {
            return null;
        }

        $layer = $this->dataLayer($xpath);
        $category = self::layerValue($layer, 'listing_category_slug')
            ?? $this->firstAttribute($xpath, '//a[@data-t-listing_category_slug]', 'data-t-listing_category_slug');
        $amount = self::layerValue($layer, 'listing_price') ?? $this->firstAttribute($xpath, '//a[@data-t-listing_price]', 'data-t-listing_price');
        $currency = self::layerValue($layer, 'listing_currency') ?? $this->firstAttribute($xpath, '//a[@data-t-listing_currency]', 'data-t-listing_currency');
        $sellerName = $this->firstText($xpath, '//*['.self::hasClass('listing-item-transparency__title').']');

        return new ListingPage(
            phones: $this->listingPhones($xpath),
            photoUrls: $this->gallery($xpath, $pageUrl),
            price: $amount === null ? null : self::price($amount, (string) $currency),
            currency: $currency === null ? null : strtoupper(trim($currency)),
            contract: self::contractFromWords($category),
            propertyType: self::typeFromWords($category),
            city: $this->firstText($xpath, '//*['.self::hasClass('listing-item__address-region').']'),
            neighborhood: $this->firstText($xpath, '//*['.self::hasClass('listing-item__address-location').']')
                ?? self::layerValue($layer, 'listing_location_title'),
            furnished: self::furnishedFrom($category),
            postedAt: self::validFrom($product),
            sellerName: $sellerName,
            sellerSignals: $this->sellerSignals($xpath, $sellerName),
            title: $this->firstText($xpath, '//h1['.self::hasClass('listing-item__header').']')
                ?? self::layerValue($layer, 'listing_title'),
            description: $description,
        );
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

    /** @return array<string, mixed> le premier objet `dataLayer.push({...})` qui porte `listing_id`, vide sinon */
    private function dataLayer(DOMXPath $xpath): array
    {
        foreach ($xpath->query('//script[not(@src)]') ?: [] as $script) {
            $code = (string) $script->textContent;
            if (! str_contains($code, 'listing_id') || preg_match_all('/dataLayer\.push\((\{.*?\})\);/s', $code, $found) < 1) {
                continue;
            }
            foreach ($found[1] as $json) {
                $data = json_decode($json, true);
                if (is_array($data) && array_key_exists('listing_id', $data)) {
                    return $data;
                }
            }
        }

        return [];
    }

    /** @param array<string, mixed> $layer */
    private static function layerValue(array $layer, string $key): ?string
    {
        $value = $layer[$key] ?? null;

        return is_scalar($value) ? self::squish((string) $value) : null;
    }

    /** @return array<string, mixed> le `Product` du JSON-LD (`ItemPage.mainEntity`), vide s'il manque */
    private function product(DOMXPath $xpath): array
    {
        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $script) {
            $data = json_decode((string) $script->textContent, true);
            foreach (is_array($data) ? (array) ($data['@graph'] ?? [$data]) : [] as $node) {
                $entity = is_array($node) ? ($node['mainEntity'] ?? null) : null;
                if (is_array($entity) && in_array('Product', (array) ($entity['@type'] ?? []), true)) {
                    return $entity;
                }
            }
        }

        return [];
    }

    /** @param array<string, mixed> $product */
    private static function validFrom(array $product): ?CarbonImmutable
    {
        $value = is_array($product['offers'] ?? null) ? ($product['offers']['validFrom'] ?? null) : null;
        if (! is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/', trim($value)) !== 1) {
            return null;
        }

        try {
            // L'heure de Dakar est l'UTC : une date sans fuseau se lit telle quelle.
            return CarbonImmutable::parse(trim($value), 'UTC');
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * La galerie : pour chaque image de `ul.gallery--main`, la plus large du `srcset`, à défaut son `src`.
     *
     * @return list<string>
     */
    private function gallery(DOMXPath $xpath, string $pageUrl): array
    {
        $candidates = [];
        foreach ($xpath->query('(//ul['.self::hasClass('gallery--main').'])[1]//img') ?: [] as $img) {
            if (! $img instanceof DOMElement) {
                continue;
            }
            $best = null;
            $bestWidth = -1;
            foreach (explode(',', $img->getAttribute('srcset')) as $entry) {
                if (preg_match('/^\s*(\S+)\s+(\d+)w\s*$/', $entry, $m) === 1 && (int) $m[2] > $bestWidth) {
                    [$best, $bestWidth] = [$m[1], (int) $m[2]];
                }
            }
            $candidates[] = $best ?? $img->getAttribute('src');
        }

        return self::keepPhotos($candidates, $pageUrl, self::PHOTO_HOSTS);
    }

    /** @return list<array{signal: string, evidence: ?string}> */
    private function sellerSignals(DOMXPath $xpath, ?string $name): array
    {
        $signals = [];

        $since = $this->firstText($xpath, '//*['.self::hasClass('listing-item-transparency__member-since').']');
        if ($since !== null) {
            $signals[] = ['signal' => 'member_since', 'evidence' => $since];
        }

        $verified = $this->firstText($xpath, '//*['.self::hasClass('listing-item-transparency__verified__list').']');
        if ($verified !== null) {
            $signals[] = ['signal' => 'verified', 'evidence' => $verified];
        }

        return [...$signals, ...self::businessNameSignal($name)];
    }
}
