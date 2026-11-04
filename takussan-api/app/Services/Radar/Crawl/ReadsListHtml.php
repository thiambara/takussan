<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\PropertyType;
use App\Services\Radar\HtmlCleaner;
use App\Services\Radar\PagePhones;
use App\Support\RadarPhone;
use DOMDocument;
use DOMNode;
use DOMXPath;
use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Throwable;

/**
 * TCK-2392 — ce que les adaptateurs partagent : charger le HTML d'une liste (UTF-8, erreurs de libxml tues, aucun accès
 * réseau), lire un texte replié, absolutiser un lien, et reconnaître un type et un contrat dans les mots d'une catégorie.
 *
 * TCK-2465 — et pour la page d'une annonce : les numéros des attributs moins ceux du site, la galerie filtrée sur les
 * hôtes d'images déclarés, un texte qui garde ses paragraphes, le nom d'un vendeur qui dit une entreprise.
 */
trait ReadsListHtml
{
    /** Mots d'une catégorie → type de bien. Le premier qui figure dans le texte l'emporte. */
    private const TYPE_WORDS = [
        'appartement' => PropertyType::Apartment,
        'studio' => PropertyType::Studio,
        'chambre' => PropertyType::Room,
        'villa' => PropertyType::Villa,
        'maison' => PropertyType::House,
        'terrain' => PropertyType::Land,
        'bureau' => PropertyType::Office,
        'commerce' => PropertyType::Shop,
        'boutique' => PropertyType::Shop,
        'magasin' => PropertyType::Shop,
        'entrepot' => PropertyType::Warehouse,
        'immeuble' => PropertyType::Other,
    ];

    private function xpath(string $html): DOMXPath
    {
        $dom = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            // Même préambule que `HtmlCleaner` : sans lui, libxml lit en ISO-8859-1 une page qui ne déclare rien.
            $dom->loadHTML('<?xml encoding="UTF-8">'.($html === '' ? '<html></html>' : $html), LIBXML_NONET | LIBXML_COMPACT);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        return new DOMXPath($dom);
    }

    /** Une expression XPath qui vaut « l'attribut class contient ce mot entier ». */
    private static function hasClass(string $class): string
    {
        return "contains(concat(' ', normalize-space(@class), ' '), ' {$class} ')";
    }

    private function firstText(DOMXPath $xpath, string $query, ?DOMNode $context = null): ?string
    {
        $node = $xpath->query($query, $context)?->item(0);

        return $node === null ? null : self::squish($node->textContent);
    }

    private function firstAttribute(DOMXPath $xpath, string $query, string $attribute, ?DOMNode $context = null): ?string
    {
        $node = $xpath->query($query, $context)?->item(0);
        if (! $node instanceof \DOMElement || ! $node->hasAttribute($attribute)) {
            return null;
        }

        $value = trim($node->getAttribute($attribute));

        return $value === '' ? null : $value;
    }

    private static function squish(?string $text): ?string
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', (string) $text));

        return $text === '' ? null : $text;
    }

    /** Le lien absolutisé contre la page, `http(s)` seulement ; null s'il ne s'analyse pas. */
    private static function absolute(string $href, string $base): ?string
    {
        try {
            $uri = UriResolver::resolve(new Uri($base), new Uri(trim($href)))->withFragment('');
        } catch (Throwable) {
            return null;
        }

        return in_array(strtolower($uri->getScheme()), ['http', 'https'], true) ? (string) $uri : null;
    }

    /** L'hôte de l'URL est-il ce domaine, ou l'un de ses sous-domaines ? */
    private static function onDomain(string $url, string $domain): bool
    {
        try {
            $host = rtrim(strtolower((new Uri($url))->getHost()), '.');
        } catch (Throwable) {
            return false;
        }

        return $host === $domain || str_ends_with($host, '.'.$domain);
    }

    private static function typeFromWords(?string $text): ?string
    {
        $text = self::fold($text);
        foreach (self::TYPE_WORDS as $word => $type) {
            if (str_contains($text, $word)) {
                return $type->value;
            }
        }

        return null;
    }

    private static function contractFromWords(?string $text): ?string
    {
        $text = self::fold($text);

        return match (true) {
            preg_match('/\b(louer|location|loyer)\b/u', $text) === 1 => 'rent',
            preg_match('/\b(vendre|vente)\b/u', $text) === 1 => 'sale',
            default => null,
        };
    }

    /** Le nombre de chambres d'un texte (« 3 chambres », « 1 chambre ») ; null sinon. */
    private static function bedroomsFrom(?string $text): ?int
    {
        return preg_match('/(\d{1,2})\s*chambres?\b/iu', (string) $text, $m) === 1 ? (int) $m[1] : null;
    }

    /** La surface d'un texte (« 250 m² », « 120m2 », « 85,5 m² ») ; null sinon. */
    private static function surfaceFrom(?string $text): ?float
    {
        return preg_match('/(\d{1,6}(?:[.,]\d{1,2})?)\s*m(?:²|2)(?![\p{L}\d])/iu', (string) $text, $m) === 1
            ? (float) str_replace(',', '.', $m[1])
            : null;
    }

    /** Minuscules sans accents ni tirets : « Appartements-à-louer » → « appartements a louer ». */
    private static function fold(?string $text): string
    {
        $text = mb_strtolower((string) $text);
        $text = strtr($text, ['à' => 'a', 'â' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'û' => 'u', 'ù' => 'u', 'ç' => 'c']);

        return (string) preg_replace('/[-_\/]+/', ' ', $text);
    }

    /**
     * TCK-2465 — les numéros que la page porte dans ses attributs (`PagePhones`), plus ceux donnés à part (un JSON de la
     * page), en E.164, sans doublon, moins ceux du site : `excludedPhones()` et le JSON-LD `Organization`.
     *
     * @param  list<mixed>  $extra
     * @return list<string>
     */
    private function listingPhones(DOMXPath $xpath, array $extra = []): array
    {
        $phones = PagePhones::fromDom($xpath);
        foreach ($extra as $raw) {
            $phone = is_scalar($raw) ? RadarPhone::canonical((string) $raw) : null;
            if ($phone !== null) {
                $phones[] = $phone;
            }
        }
        $excluded = [...$this->excludedPhones(), ...PagePhones::organizationPhones($xpath)];

        return array_values(array_diff(array_unique($phones), $excluded));
    }

    /**
     * TCK-2465 — la galerie gardée : absolutisée contre la page, `https` seulement, sur l'un des hôtes EXACTS déclarés,
     * sans doublon, dans l'ordre, au plus `HtmlCleaner::MAX_PHOTOS`. Le HTML est une donnée : une URL d'ailleurs est
     * ignorée.
     *
     * @param  list<mixed>  $candidates
     * @param  list<string>  $hosts
     * @return list<string>
     */
    private static function keepPhotos(array $candidates, string $pageUrl, array $hosts): array
    {
        $photos = [];
        foreach ($candidates as $candidate) {
            $url = is_string($candidate) && trim($candidate) !== '' ? self::absolute($candidate, $pageUrl) : null;
            if ($url === null || strtolower((string) parse_url($url, PHP_URL_SCHEME)) !== 'https'
                || ! in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), $hosts, true)) {
                continue;
            }
            $photos[$url] = true;
            if (count($photos) >= HtmlCleaner::MAX_PHOTOS) {
                break;
            }
        }

        return array_keys($photos);
    }

    /**
     * TCK-2465 — le texte d'un nœud, ses paragraphes gardés : un saut de ligne entre deux blocs (`p`, `div`, `li`,
     * `br`…), les blancs repliés dans une ligne, les lignes vides retirées.
     */
    private static function paragraphs(?DOMNode $node): ?string
    {
        if ($node === null) {
            return null;
        }

        $parts = [];
        $walk = function (DOMNode $current) use (&$walk, &$parts): void {
            foreach ($current->childNodes as $child) {
                if ($child->nodeType === XML_TEXT_NODE || $child->nodeType === XML_CDATA_SECTION_NODE) {
                    $parts[] = $child->nodeValue;
                } elseif ($child->nodeType === XML_ELEMENT_NODE) {
                    $block = in_array(strtolower($child->nodeName), ['p', 'div', 'li', 'br', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'tr'], true);
                    $parts[] = $block ? "\n" : ' ';
                    $walk($child);
                    $parts[] = $block ? "\n" : ' ';
                }
            }
        };
        $walk($node);

        return self::cleanParagraphs(implode('', $parts));
    }

    /** Des lignes repliées, sans ligne vide : « a\r\n\r\n  b » → « a\nb ». */
    private static function cleanParagraphs(?string $text): ?string
    {
        $lines = array_filter(array_map(
            fn (string $line) => trim((string) preg_replace('/[^\S\n]+/u', ' ', $line)),
            preg_split('/\R/u', (string) $text) ?: [],
        ), fn (string $line) => $line !== '');

        return $lines === [] ? null : implode("\n", $lines);
    }

    /**
     * TCK-2465 — le nom d'un vendeur qui dit une entreprise (« Agence … », « … Immobilier », « SARL », « Promoteur »…) :
     * un indice de nature, cité tel qu'écrit. Ce n'est pas une décision : la nature se juge ailleurs, sur tous les
     * indices.
     *
     * @return list<array{signal: string, evidence: ?string}>
     */
    private static function businessNameSignal(?string $name): array
    {
        $folded = self::fold($name);

        return $name !== null && preg_match('/\b(agence|immobili\w*|immo|promoteur|promotion|sarl|suarl|sas|groupe|group|company|properties|real estate|realty|invest\w*|construction|btp|cabinet)\b/u', $folded) === 1
            ? [['signal' => 'business_name', 'evidence' => $name]]
            : [];
    }
}
