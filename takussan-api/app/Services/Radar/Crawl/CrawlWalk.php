<?php

namespace App\Services\Radar\Crawl;

use Carbon\CarbonInterface;

/**
 * TCK-2438 — ce qu'un passage partage entre ses listes : son budget (pages, temps), les pages déjà lues (une pagination
 * qui y renvoie est une boucle) et les annonces déjà observées (une annonce de deux listes n'est observée qu'une fois).
 */
final class CrawlWalk
{
    /** @var array<string, true> les pages lues, demandées ou atteintes par redirection */
    public array $visited = [];

    /** @var array<int, true> les annonces observées */
    public array $seen = [];

    public function __construct(
        public readonly int $maxPages,
        public readonly CarbonInterface $deadline,
    ) {}
}
