<?php

namespace App\Services\Radar\Crawl;

/** TCK-2392 — une page de liste lue : ses cartes, dans l'ordre, et l'URL de la page suivante (null : dernière page). */
final readonly class ListPage
{
    /** @param  list<ListCard>  $cards */
    public function __construct(
        public array $cards,
        public ?string $nextUrl,
    ) {}
}
