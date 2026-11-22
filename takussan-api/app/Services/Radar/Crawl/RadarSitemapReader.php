<?php

namespace App\Services\Radar\Crawl;

use Carbon\CarbonImmutable;
use DOMDocument;
use DOMElement;
use GuzzleHttp\Psr7\Uri;
use Throwable;

/**
 * TCK-2467 (ADR-0087 §4) — la lecture d'un sitemap d'annonces (`<urlset>` du protocole sitemaps.org), déjà lu par
 * `UrlFetcher::fetchXml()` (SSRF, `robots.txt`, créneau, `max_bytes`).
 *
 * Le XML vient d'un site tiers : c'est une DONNÉE, lue sans rien lui confier.
 *  - **Aucune DTD** : un document qui en porte une (`<!DOCTYPE`, donc toute déclaration d'entité) est refusé avant
 *    l'analyse. Un sitemap n'en a jamais besoin ; c'est ce qui ferme l'XXE et l'expansion d'entités (« milliard de
 *    rires »), quelle que soit la version de libxml.
 *  - **Aucun réseau** : `LIBXML_NONET` ; ni `LIBXML_NOENT` (substitution d'entités), ni `LIBXML_DTDLOAD`, ni
 *    `LIBXML_PARSEHUGE`.
 *  - **La racine doit être `<urlset>`.** Un index (`<sitemapindex>`) n'est pas lu ici : l'adaptateur déclare les sitemaps
 *    de ses catégories. Relevé du 2026-11-04 : une catégorie inconnue d'Expat-Dakar répond **200** avec
 *    `<error><code>404</code>…</error>` — une catégorie renommée par le site n'est donc jamais lue comme vide.
 *  - **Une URL d'annonce est `https` et sur l'hôte du sitemap** (la règle du protocole) ; les autres sont ignorées.
 *
 * Rend null pour un document refusé ou illisible (le passage le dit : `radar.crawl.sitemap_invalid`), sinon les entrées
 * dans l'ordre du fichier, sans doublon. Une liste vide est rendue telle quelle : c'est l'appelant qui juge.
 */
final class RadarSitemapReader
{
    /** @return list<SitemapEntry>|null */
    public static function parse(string $xml, string $sitemapUrl): ?array
    {
        if (trim($xml) === '' || preg_match('/<!DOCTYPE|<!ENTITY/i', $xml) === 1) {
            return null;
        }

        $host = self::host($sitemapUrl);
        if ($host === null) {
            return null;
        }

        $previous = libxml_use_internal_errors(true);
        try {
            $doc = new DOMDocument;
            $loaded = $doc->loadXML($xml, LIBXML_NONET | LIBXML_NOCDATA);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        $root = $loaded ? $doc->documentElement : null;
        if (! $root instanceof DOMElement || $doc->doctype !== null || $root->localName !== 'urlset') {
            return null;
        }

        $entries = [];
        foreach ($root->childNodes as $node) {
            if (! $node instanceof DOMElement || $node->localName !== 'url') {
                continue;
            }
            $loc = self::childText($node, 'loc');
            if ($loc === null || self::host($loc) !== $host) {
                continue;
            }
            $entries[$loc] ??= new SitemapEntry($loc, self::date(self::childText($node, 'lastmod')));
        }

        return array_values($entries);
    }

    /** L'hôte d'une URL `https` sans identifiants ni port, en minuscules ; null sinon. */
    private static function host(string $url): ?string
    {
        try {
            $uri = new Uri($url);
        } catch (Throwable) {
            return null;
        }
        if ($uri->getScheme() !== 'https' || $uri->getUserInfo() !== '' || $uri->getPort() !== null || $uri->getHost() === '') {
            return null;
        }

        return strtolower($uri->getHost());
    }

    private static function childText(DOMElement $parent, string $name): ?string
    {
        foreach ($parent->childNodes as $child) {
            if ($child instanceof DOMElement && $child->localName === $name) {
                $text = trim($child->textContent);

                return $text === '' ? null : $text;
            }
        }

        return null;
    }

    /** Une date W3C (`2026-08-09T20:31:49+00:00`, ou `2026-08-09`), en UTC ; null si illisible. */
    private static function date(?string $value): ?CarbonImmutable
    {
        if ($value === null || preg_match('/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/', $value) !== 1) {
            return null;
        }

        try {
            return CarbonImmutable::parse($value, 'UTC')->utc();
        } catch (Throwable) {
            return null;
        }
    }
}
