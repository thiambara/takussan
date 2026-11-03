<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\PropertyType;
use DOMDocument;
use DOMNode;
use DOMXPath;
use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Throwable;

/**
 * TCK-2392 — ce que les adaptateurs partagent : charger le HTML d'une liste (UTF-8, erreurs de libxml tues, aucun accès
 * réseau), lire un texte replié, absolutiser un lien, et reconnaître un type et un contrat dans les mots d'une catégorie.
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
}
