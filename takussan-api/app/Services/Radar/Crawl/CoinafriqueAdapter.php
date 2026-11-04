<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarSourceSite;
use App\Services\Radar\RadarAmountParser;
use Carbon\CarbonImmutable;
use DOMElement;
use DOMXPath;
use GuzzleHttp\Psr7\Query;
use Throwable;

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
 *
 * TCK-2465 (ADR-0087 §1) — **la page d'une annonce** (structure relevée le 2026-11-04) :
 * - le numéro de l'annonceur n'est QUE dans des attributs (`tel:`, `data-phone-number`, `data-mobile`, liens WhatsApp) :
 *   le texte n'en porte aucun. Le JSON de l'annonce (`div#ad-details[data-ad]`) le redit (`phone`,
 *   `user.whatsapp_phone`) ;
 * - ce JSON porte aussi le titre, la description, le prix, la devise, l'adresse, la date de création, la galerie
 *   (`images[].normal`), l'offre (`re_offer_type`), les pièces (`re_room` — des PIÈCES, pas des chambres), les salles
 *   de bain, la surface et le vendeur (`user.name`, `is_pro`, `member_since`, `published_ads`). Il est lu d'abord ;
 * - le DOM est le repli : galerie `div.slider .swiper-slide.slide-clickable` en `background-image` (la dernière
 *   diapositive, un appel à l'action, reprend la vignette `thumb_` de la première), `p.price`, `h1.title-ad`,
 *   `span[data-address]`, `.ad__info__box-descriptions` hors `p.title`, `p.username`, `img.icon-pro`, `p.nb-ads` ;
 * - le menu des catégories (une liste de liens) n'est jamais lu : la description vient de son seul bloc.
 */
final class CoinafriqueAdapter implements RadarSiteAdapter
{
    use ReadsListHtml;

    private const DOMAIN = 'coinafrique.com';

    /** TCK-2465 — les hôtes des photos d'une annonce (relevé du 2026-11-04). */
    private const PHOTO_HOSTS = ['images.coinafrique.com'];

    /** TCK-2465 — le numéro du service de CoinAfrique Sénégal (bandeau « Veuillez contacter ces numéros suivants »). */
    private const SITE_PHONES = ['+221765694843'];

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

    public function excludedPhones(): array
    {
        return self::SITE_PHONES;
    }

    public function parseListing(string $html, string $pageUrl): ?ListingPage
    {
        $xpath = $this->xpath($html);
        $ad = $this->adJson($xpath);

        $description = self::cleanParagraphs(is_string($ad['description'] ?? null) ? $ad['description'] : null)
            ?? self::paragraphs($xpath->query('(//div['.self::hasClass('ad__info__box-descriptions').'])[1]/p[not('.self::hasClass('title').')]')?->item(0));
        if ($description === null) {
            return null;
        }

        $user = is_array($ad['user'] ?? null) ? $ad['user'] : [];
        $priceText = $this->firstText($xpath, '//p['.self::hasClass('price').']');
        $parsedPrice = $priceText === null ? null : RadarAmountParser::parse($priceText);
        $category = is_array($ad['category'] ?? null) && is_string($ad['category']['name'] ?? null) ? $ad['category']['name'] : null;
        $path = (string) parse_url($pageUrl, PHP_URL_PATH);
        $pathCategory = preg_match('#^/annonce/([^/]+)/#', $path, $m) === 1 ? $m[1] : null;
        $address = self::squish(is_string($ad['address'] ?? null) ? $ad['address'] : null)
            ?? $this->firstAttribute($xpath, '//span[@data-address]', 'data-address');
        [$neighborhood, $city] = self::place($address);
        $title = self::squish(is_string($ad['title'] ?? null) ? $ad['title'] : null)
            ?? $this->firstText($xpath, '//h1['.self::hasClass('title-ad').']');
        $sellerName = self::squish(is_string($user['name'] ?? null) ? $user['name'] : null)
            ?? $this->firstText($xpath, '//p['.self::hasClass('username').']');

        return new ListingPage(
            phones: $this->phones($xpath, $ad, $user),
            photoUrls: $this->gallery($xpath, $ad, $pageUrl),
            price: self::positiveInt($ad['price'] ?? null) ?? ($parsedPrice['amount'] ?? null),
            currency: self::currency($ad['currency'] ?? null) ?? ($priceText !== null && preg_match('/\b(f\s?cfa|cfa|xof)\b/iu', $priceText) === 1 ? 'XOF' : null),
            contract: match ($ad['re_offer_type'] ?? null) {
                'sell' => 'sale',
                'rent' => 'rent',
                default => self::contractFromWords($title),
            },
            propertyType: self::typeFromWords($category) ?? self::typeFromWords($pathCategory),
            rentPeriod: $parsedPrice['period'] ?? null,
            city: $city,
            neighborhood: $neighborhood,
            rooms: self::positiveInt($ad['re_room'] ?? null) ?? self::positiveInt($this->characteristic($xpath, 'pièces')),
            bathrooms: self::positiveInt($ad['re_bathroom'] ?? null) ?? self::positiveInt($this->characteristic($xpath, 'salles de bain')),
            surfaceM2: self::positiveFloat($ad['re_surface'] ?? null) ?? self::positiveFloat($this->characteristic($xpath, 'superficie')),
            furnished: str_contains(self::fold($category ?? $pathCategory), 'meuble') ? true : null,
            postedAt: self::date($ad['date_creation'] ?? null),
            sellerName: $sellerName,
            sellerSignals: $this->sellerSignals($xpath, $user, $sellerName),
            title: $title,
            description: $description,
        );
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

    private function nextPage(DOMXPath $xpath, string $pageUrl): ?string
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

    /** @return array<string, mixed> le JSON de `div#ad-details[data-ad]`, vide s'il manque ou ne se lit pas */
    private function adJson(DOMXPath $xpath): array
    {
        $raw = $this->firstAttribute($xpath, '//div[@id="ad-details"]', 'data-ad');
        $data = $raw === null ? null : json_decode($raw, true);

        return is_array($data) ? $data : [];
    }

    /**
     * Les numéros des attributs, puis ceux du JSON de l'annonce ; jamais celui du service de CoinAfrique.
     *
     * @param  array<string, mixed>  $ad
     * @param  array<string, mixed>  $user
     * @return list<string>
     */
    private function phones(DOMXPath $xpath, array $ad, array $user): array
    {
        return $this->listingPhones($xpath, [$ad['phone'] ?? null, $user['whatsapp_phone'] ?? null, $user['phone'] ?? null]);
    }

    /**
     * La galerie : `images[].normal` du JSON, à défaut les diapositives cliquables du premier carrousel.
     *
     * @param  array<string, mixed>  $ad
     * @return list<string>
     */
    private function gallery(DOMXPath $xpath, array $ad, string $pageUrl): array
    {
        $candidates = [];
        foreach (is_array($ad['images'] ?? null) ? $ad['images'] : [] as $image) {
            if (is_array($image) && is_string($image['normal'] ?? null)) {
                $candidates[] = $image['normal'];
            }
        }

        if ($candidates === []) {
            $slides = $xpath->query('(//div['.self::hasClass('slider').'])[1]//div['.self::hasClass('swiper-slide').' and '.self::hasClass('slide-clickable').']');
            foreach ($slides ?: [] as $slide) {
                if ($slide instanceof DOMElement && preg_match('/background-image\s*:\s*url\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)/i', $slide->getAttribute('style'), $m) === 1) {
                    $candidates[] = $m[1];
                }
            }
        }

        return self::keepPhotos($candidates, $pageUrl, self::PHOTO_HOSTS);
    }

    /** La valeur d'une caractéristique du bloc « Détails du bien » (« Nbre de pièces » → « 9 »). */
    private function characteristic(DOMXPath $xpath, string $label): ?string
    {
        foreach ($xpath->query('(//div['.self::hasClass('details-characteristics').'])[1]//li') ?: [] as $item) {
            if (str_contains(self::fold($item->textContent), self::fold($label))) {
                return $this->firstText($xpath, './/span['.self::hasClass('qt').']', $item);
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $user
     * @return list<array{signal: string, evidence: ?string}>
     */
    private function sellerSignals(DOMXPath $xpath, array $user, ?string $name): array
    {
        $signals = [];

        $badge = $this->firstAttribute($xpath, '//img['.self::hasClass('icon-pro').']', 'alt');
        if ($badge !== null || ($user['is_pro'] ?? null) === true) {
            $signals[] = ['signal' => 'professional_badge', 'evidence' => $badge ?? 'is_pro'];
        }

        $count = $this->firstText($xpath, '//p['.self::hasClass('nb-ads').']')
            ?? (self::positiveInt($user['published_ads'] ?? null) === null ? null : $user['published_ads'].' Annonces');
        if ($count !== null) {
            $signals[] = ['signal' => 'listing_count', 'evidence' => (string) $count];
        }

        if (is_string($user['member_since'] ?? null) && self::date($user['member_since']) !== null) {
            $signals[] = ['signal' => 'member_since', 'evidence' => $user['member_since']];
        }

        return [...$signals, ...self::businessNameSignal($name)];
    }

    /**
     * « Saly Portudal, Mbour, Sénégal » → [« Saly Portudal », « Mbour »] ; « Thies, Sénégal » → [null, « Thies »].
     *
     * @return array{0: ?string, 1: ?string} [quartier, ville]
     */
    private static function place(?string $address): array
    {
        $parts = array_values(array_filter(array_map('trim', explode(',', (string) $address)), fn (string $p) => $p !== ''));
        if ($parts !== [] && self::fold(end($parts)) === 'senegal') {
            array_pop($parts);
        }

        return match (count($parts)) {
            0 => [null, null],
            1 => [null, $parts[0]],
            default => [$parts[count($parts) - 2], $parts[count($parts) - 1]],
        };
    }

    private static function currency(mixed $value): ?string
    {
        return is_string($value) && in_array(strtoupper(trim($value)), ['CFA', 'FCFA', 'XOF', 'F CFA'], true) ? 'XOF' : null;
    }

    private static function positiveInt(mixed $value): ?int
    {
        if (is_string($value)) {
            $value = trim($value);
        }

        return (is_int($value) || (is_string($value) && preg_match('/^\d{1,13}$/', $value) === 1)) && (int) $value > 0 ? (int) $value : null;
    }

    private static function positiveFloat(mixed $value): ?float
    {
        if (is_string($value)) {
            $value = str_replace(',', '.', trim($value));
        }

        return is_numeric($value) && (float) $value > 0 ? (float) $value : null;
    }

    private static function date(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/', $value) !== 1) {
            return null;
        }

        try {
            return CarbonImmutable::parse($value)->utc();
        } catch (Throwable) {
            return null;
        }
    }
}
