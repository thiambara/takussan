<?php

namespace App\Services\Radar;

use DOMDocument;
use DOMElement;
use DOMXPath;
use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Throwable;

/**
 * TCK-2386 (ADR-0077 §10) — d'une page d'annonce au texte que lit l'extraction.
 *
 * - le bruit retiré : `script`, `style`, `noscript`, `svg`, `iframe`, `nav`, `footer`, `form`,
 *   `header` ;
 * - le titre : `og:title`, sinon `<title>` ;
 * - le texte : `og:description` puis le corps, blancs repliés, borné à
 *   `radar.fetch.max_text_chars` caractères ;
 * - les photos : `og:image` puis les `image` du JSON-LD, absolutisées contre l'URL de la page,
 *   `http(s)` seulement, dédoublonnées, au plus 20. **Aucune n'est téléchargée** : seules les URL
 *   source sont gardées.
 *
 * Le HTML vient d'un site tiers : c'est une DONNÉE. Rien n'en est exécuté ni suivi ici, et le texte
 * rendu passe par `ExternalContent::wrap()` avant d'atteindre un modèle.
 */
final class HtmlCleaner
{
    public const MAX_PHOTOS = 20;

    private const NOISE = ['script', 'style', 'noscript', 'svg', 'iframe', 'nav', 'footer', 'form', 'header', 'template'];

    public function clean(string $html, string $baseUrl): CleanedPage
    {
        $maxChars = (int) config('radar.fetch.max_text_chars', 20_000);

        if (trim($html) === '') {
            return new CleanedPage('', null, []);
        }

        $dom = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            // Le préambule XML fixe l'encodage à UTF-8 : sans lui, libxml lit en ISO-8859-1 une page
            // qui ne le déclare pas, et « Thiès » devient « ThiÃ¨s ». Une page dans un autre jeu
            // l'est rarement ; elle se lirait mal, sans lever.
            $dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET | LIBXML_COMPACT);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        $xpath = new DOMXPath($dom);

        $title = $this->meta($xpath, 'og:title') ?? $this->firstText($xpath, '//title');
        $description = $this->meta($xpath, 'og:description');
        $photos = $this->photos($xpath, $baseUrl);

        foreach (self::NOISE as $tag) {
            foreach (iterator_to_array($dom->getElementsByTagName($tag)) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }

        $body = $dom->getElementsByTagName('body')->item(0);
        $bodyText = $body !== null ? $this->blockText($body) : '';

        $text = $this->collapse(trim(($description ?? '').' '.$bodyText));

        return new CleanedPage(mb_substr($text, 0, $maxChars), $title, $photos);
    }

    private function meta(DOMXPath $xpath, string $property): ?string
    {
        $nodes = $xpath->query(sprintf('//meta[@property="%1$s" or @name="%1$s"]/@content', $property));
        $value = $nodes !== false && $nodes->length > 0 ? $this->collapse((string) $nodes->item(0)?->nodeValue) : '';

        return $value === '' ? null : $value;
    }

    private function firstText(DOMXPath $xpath, string $query): ?string
    {
        $nodes = $xpath->query($query);
        $value = $nodes !== false && $nodes->length > 0 ? $this->collapse((string) $nodes->item(0)?->textContent) : '';

        return $value === '' ? null : $value;
    }

    /**
     * Le texte d'un nœud, un blanc entre deux éléments : `textContent` collerait `<p>Villa</p><p>Saly</p>`
     * en « VillaSaly ».
     */
    private function blockText(DOMElement $root): string
    {
        $parts = [];
        $walk = function (\DOMNode $node) use (&$walk, &$parts): void {
            foreach ($node->childNodes as $child) {
                if ($child->nodeType === XML_TEXT_NODE || $child->nodeType === XML_CDATA_SECTION_NODE) {
                    $parts[] = $child->nodeValue;
                } elseif ($child->nodeType === XML_ELEMENT_NODE) {
                    $parts[] = ' ';
                    $walk($child);
                    $parts[] = ' ';
                }
            }
        };
        $walk($root);

        return implode('', $parts);
    }

    private function collapse(string $text): string
    {
        return trim(preg_replace('/[\s\x{00A0}\x{2007}\x{202F}]+/u', ' ', $text) ?? $text);
    }

    /** @return list<string> */
    private function photos(DOMXPath $xpath, string $baseUrl): array
    {
        $candidates = [];

        $og = $xpath->query('//meta[@property="og:image" or @name="og:image" or @property="og:image:url"]/@content');
        foreach ($og === false ? [] : $og as $attribute) {
            $candidates[] = (string) $attribute->nodeValue;
        }

        $scripts = $xpath->query('//script[@type="application/ld+json"]');
        foreach ($scripts === false ? [] : $scripts as $script) {
            $data = json_decode((string) $script->textContent, true);
            if (is_array($data)) {
                $this->jsonLdImages($data, $candidates);
            }
        }

        $photos = [];
        foreach ($candidates as $candidate) {
            $url = $this->absolute(trim($candidate), $baseUrl);
            if ($url !== null && ! in_array($url, $photos, true)) {
                $photos[] = $url;
            }
            if (count($photos) >= self::MAX_PHOTOS) {
                break;
            }
        }

        return $photos;
    }

    /**
     * Les valeurs des clés `image` d'un document JSON-LD, à toute profondeur (`@graph`, offres
     * imbriquées) : une chaîne, une liste de chaînes, un `ImageObject` (`url` / `contentUrl`).
     *
     * @param  array<mixed>  $data
     * @param  list<string>  $out
     */
    private function jsonLdImages(array $data, array &$out, int $depth = 0): void
    {
        if ($depth > 10) {
            return;
        }

        foreach ($data as $key => $value) {
            if ($key === 'image') {
                $this->imageValues($value, $out);
            } elseif (is_array($value)) {
                $this->jsonLdImages($value, $out, $depth + 1);
            }
        }
    }

    /** @param list<string> $out */
    private function imageValues(mixed $value, array &$out): void
    {
        if (is_string($value)) {
            $out[] = $value;

            return;
        }

        if (! is_array($value)) {
            return;
        }

        if (array_is_list($value)) {
            foreach ($value as $item) {
                $this->imageValues($item, $out);
            }

            return;
        }

        foreach (['url', 'contentUrl'] as $key) {
            if (isset($value[$key]) && is_string($value[$key])) {
                $out[] = $value[$key];

                return;
            }
        }
    }

    private function absolute(string $candidate, string $baseUrl): ?string
    {
        if ($candidate === '') {
            return null;
        }

        try {
            $url = (string) UriResolver::resolve(new Uri($baseUrl), new Uri($candidate));
        } catch (Throwable) {
            return null;
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $host = parse_url($url, PHP_URL_HOST);

        return in_array($scheme, ['http', 'https'], true) && is_string($host) && $host !== '' ? $url : null;
    }
}
