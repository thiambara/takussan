<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarSourceSite;

/**
 * TCK-2392 (ADR-0077 §10) — le contrat d'un adaptateur de site : d'une page de liste, il tire des cartes (des URL
 * d'annonce, et ce que la carte affiche) et l'URL de la page suivante. La lecture réseau (SSRF, `robots.txt`, créneau
 * par domaine) est celle d'`UrlFetcher`, jamais la sienne. Un adaptateur de plus : TCK-2424.
 *
 * TCK-2465 (ADR-0087 §1) — il lit aussi la page d'UNE annonce (`parseListing()`), sans IA, pour l'extraction
 * (`ExtractRadarListing`) : ce que la page dit en clair fait foi. Il ne rend jamais un numéro du site lui-même
 * (`excludedPhones()`, et ceux du JSON-LD `Organization`), ni une photo hors `https` ou hors des hôtes d'images qu'il
 * déclare.
 *
 * TCK-2467 (ADR-0087 §4) — il déclare les sitemaps d'annonces du site (`sitemapUrls()`, dans le code : ni la console ni la
 * configuration ne les élargissent) et ce que chacun dit de ses annonces (`sitemapCategory()`). Un site sans sitemap
 * exploitable rend `[]` : sa source découvre par les listes.
 *
 * Le HTML vient d'un site tiers : c'est une DONNÉE. Une URL qui ne désigne pas une annonce du site est ignorée, une page
 * suivante hors du site aussi.
 */
interface RadarSiteAdapter
{
    public function site(): RadarSourceSite;

    /** La page de liste lue par un passage quand la console n'en règle aucune (`radar.crawl.sites.<site>.start_url`). */
    public function startUrl(): string;

    /**
     * TCK-2438 — les hôtes EXACTS d'où une URL de départ réglée dans la console peut partir (`RadarStartUrls`). Déclarés
     * ici, dans le code : la console ne peut pas les élargir.
     *
     * @return list<string>
     */
    public function startHosts(): array;

    public function parse(string $html, string $pageUrl): ListPage;

    /**
     * TCK-2465 — la page d'une annonce, lue sans IA ; null quand la page n'est pas reconnue (aucune description trouvée :
     * le site a changé, ou ce n'est pas une annonce) — l'extraction retombe alors sur `HtmlCleaner`.
     */
    public function parseListing(string $html, string $pageUrl): ?ListingPage;

    /**
     * TCK-2465 — les numéros du site lui-même (service client, standard), en E.164 : jamais rendus comme ceux d'un
     * annonceur, ni par l'adaptateur, ni par l'extraction qui le consulte.
     *
     * @return list<string>
     */
    public function excludedPhones(): array;

    /**
     * TCK-2467 — les sitemaps d'annonces que lit une source réglée `sitemap`, un par catégorie immobilière ; vide : pas de
     * découverte par sitemap pour ce site (`RadarCrawlDiscovery::effective()`).
     *
     * @return list<string>
     */
    public function sitemapUrls(): array;

    /**
     * TCK-2467 — ce que la catégorie d'un sitemap de {@see self::sitemapUrls()} dit de ses annonces : le type
     * (`PropertyType`) et le contrat (`rent`/`sale`), null quand elle ne le dit pas. C'est la « carte » d'une URL neuve
     * pour le filtre des cibles (TCK-2468).
     *
     * @return array{type: ?string, contract: ?string}
     */
    public function sitemapCategory(string $sitemapUrl): array;
}
