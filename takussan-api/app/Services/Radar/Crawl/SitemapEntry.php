<?php

namespace App\Services\Radar\Crawl;

use Carbon\CarbonImmutable;

/**
 * TCK-2467 — une entrée d'un sitemap d'annonces : l'URL de l'annonce et sa date de modification (`<lastmod>`), null quand
 * le sitemap ne la donne pas ou qu'elle est illisible. Les photos du sitemap (`<image:loc>`) ne sont pas lues : la
 * galerie vient de la page de l'annonce, lue par l'adaptateur.
 */
final readonly class SitemapEntry
{
    public function __construct(
        public string $url,
        public ?CarbonImmutable $lastmod = null,
    ) {}
}
