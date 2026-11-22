<?php

namespace App\Models\Enums;

use App\Services\Radar\Crawl\RadarSiteAdapter;

/**
 * TCK-2467 (ADR-0087 §4) — comment une source collectée découvre ses annonces.
 *
 * - `sitemap` : les sitemaps des catégories que l'adaptateur déclare (`RadarSiteAdapter::sitemapUrls()`) — tout
 *   l'inventaire en quelques requêtes, avec la date de modification de chaque annonce ;
 * - `lists` : les pages de liste, de page en page (ADR-0080), le seul chemin d'un site sans sitemap.
 *
 * La colonne `radar_crawl_sources.discovery` est nulle tant que la console ne l'a pas réglée : la source suit alors le
 * défaut de son adaptateur ({@see self::effective()}).
 */
enum RadarCrawlDiscovery: string
{
    case Lists = 'lists';
    case Sitemap = 'sitemap';

    /**
     * Ce qu'une source suit vraiment : son réglage, ou à défaut `sitemap` quand l'adaptateur en déclare et `lists` sinon.
     * Un réglage `sitemap` sur un site dont l'adaptateur n'en déclare (plus) aucun rend `lists` : jamais une lecture vide.
     */
    public static function effective(?self $stored, RadarSiteAdapter $adapter): self
    {
        $available = $adapter->sitemapUrls() !== [];

        return match (true) {
            ! $available => self::Lists,
            $stored === null => self::Sitemap,
            default => $stored,
        };
    }
}
