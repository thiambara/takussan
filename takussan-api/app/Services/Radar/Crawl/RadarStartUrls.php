<?php

namespace App\Services\Radar\Crawl;

use App\Models\RadarCrawlRun;
use App\Models\RadarCrawlSource;
use GuzzleHttp\Psr7\Uri;
use Throwable;

/**
 * TCK-2438 (ADR-0080, amendement du 2026-10-30) — les URL de départ d'un site collecté, réglées dans la console
 * (`radar_crawl_sources.start_urls`).
 *
 * Le serveur lit lui-même ces pages : une URL réglée est une requête vers une cible choisie depuis la console. D'où
 * des garde-fous jugés deux fois, à l'enregistrement (`UpdateRadarCrawlSourceRequest`) ET au passage (`forRun()`). Une
 * valeur écrite en base hors de la console n'est donc jamais lue. Les garde-fous :
 *  - `https` seulement ;
 *  - un hôte de la liste EXACTE que déclare l'adaptateur (`RadarSiteAdapter::startHosts()`, dans le code, jamais en
 *    configuration) ;
 *  - ni identifiants, ni port, ni espace, ni barre oblique inverse, ni caractère de contrôle ;
 *  - au plus `radar.crawl.start_url_max_length` caractères, au plus `radar.crawl.max_start_urls` URL par site ;
 *  - pas de doublon.
 *
 * L'hôte se lit avec l'analyseur de Guzzle, celui d'`UrlFetcher`. La lecture qui suit garde ses propres contrôles
 * (SSRF à chaque saut, `robots.txt`, créneau par domaine).
 */
final class RadarStartUrls
{
    public const REFUSED_TOO_LONG = 'too_long';

    public const REFUSED_INVALID = 'invalid';

    public const REFUSED_HOST = 'host';

    public static function maxCount(): int
    {
        return max(1, (int) config('radar.crawl.max_start_urls', 10));
    }

    public static function maxLength(): int
    {
        return max(1, (int) config('radar.crawl.start_url_max_length', 500));
    }

    /** Pourquoi cette URL ne peut pas être une URL de départ du site (`REFUSED_*`) ; null si elle le peut. */
    public function refusal(RadarSiteAdapter $adapter, mixed $url): ?string
    {
        if (! is_string($url) || $url === '' || preg_match('/[\s\\\\\x00-\x1F\x7F]/u', $url) === 1) {
            return self::REFUSED_INVALID;
        }
        if (strlen($url) > self::maxLength()) {
            return self::REFUSED_TOO_LONG;
        }

        try {
            $uri = new Uri($url);
        } catch (Throwable) {
            return self::REFUSED_INVALID;
        }
        if ($uri->getScheme() !== 'https' || $uri->getUserInfo() !== '' || $uri->getPort() !== null || $uri->getHost() === '') {
            return self::REFUSED_INVALID;
        }

        $hosts = array_map('strtolower', $adapter->startHosts());

        return in_array(strtolower($uri->getHost()), $hosts, true) ? null : self::REFUSED_HOST;
    }

    /**
     * Ce que la console enregistre : chaque URL sans ses espaces de bord ; une liste vide vaut null (l'URL de la
     * configuration).
     *
     * @param  array<int, mixed>|null  $urls
     * @return list<string>|null
     */
    public static function normalize(?array $urls): ?array
    {
        $urls = array_values(array_filter(
            array_map(fn ($url) => is_string($url) ? trim($url) : $url, $urls ?? []),
            fn ($url) => $url !== '' && $url !== null,
        ));

        return $urls === [] ? null : $urls;
    }

    /**
     * Les listes qu'un passage lit, dans l'ordre : celles de la source qui passent les garde-fous (sans doublon, au
     * plus `maxCount()`), ou l'URL de la configuration quand la source n'en règle aucune. Une source qui en règle,
     * mais dont aucune ne passe, rend une liste vide : le passage ne lit rien
     * ({@see RadarCrawlRun::STOP_NO_START_URL}). Il ne retombe jamais en silence sur la configuration.
     *
     * @return array{urls: list<string>, configured: bool} `configured` : les URL viennent de la console
     */
    public function forRun(?RadarCrawlSource $source, RadarSiteAdapter $adapter): array
    {
        $stored = $source?->start_urls;
        if (! is_array($stored) || $stored === []) {
            $default = $adapter->startUrl();

            return ['urls' => $this->refusal($adapter, $default) === null ? [$default] : [], 'configured' => false];
        }

        $urls = [];
        foreach ($stored as $url) {
            if ($this->refusal($adapter, $url) === null && ! in_array($url, $urls, true)) {
                $urls[] = $url;
            }
        }

        return ['urls' => array_slice($urls, 0, self::maxCount()), 'configured' => true];
    }
}
