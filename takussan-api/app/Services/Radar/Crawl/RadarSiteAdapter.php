<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarSourceSite;

/**
 * TCK-2392 (ADR-0077 §10) — le contrat d'un adaptateur de site : il ne lit QUE des pages de liste, et n'en tire que des
 * cartes (des URL d'annonce, et ce que la carte affiche) et l'URL de la page suivante. La lecture réseau (SSRF,
 * `robots.txt`, créneau par domaine) est celle d'`UrlFetcher`, jamais la sienne ; la page d'une annonce est lue par
 * l'extraction du lot 1 (`ExtractRadarListing`). Un adaptateur de plus : TCK-2424.
 *
 * Le HTML vient d'un site tiers : c'est une DONNÉE. Une URL qui ne désigne pas une annonce du site est ignorée, une page
 * suivante hors du site aussi.
 */
interface RadarSiteAdapter
{
    public function site(): RadarSourceSite;

    /** La première page de liste lue par un passage. */
    public function startUrl(): string;

    public function parse(string $html, string $pageUrl): ListPage;
}
