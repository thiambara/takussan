<?php

namespace App\Services\Radar\Crawl;

/**
 * TCK-2392 — une carte d'une page de liste, telle que l'adaptateur l'a lue : l'URL de l'annonce, et ce que la carte
 * affiche. Aucune valeur n'est devinée : une carte qui ne montre pas la surface la laisse nulle. Aucun numéro de téléphone
 * n'est lu ici, même quand la carte en porte un : l'annonceur se trouve par l'extraction, sur la page de l'annonce.
 *
 * `price` : le montant affiché en XOF, null s'il n'est pas lisible ou dans une autre monnaie.
 */
final readonly class ListCard
{
    public function __construct(
        public string $url,
        public ?string $title = null,
        public ?int $price = null,
        public ?string $rentPeriod = null,
        public ?string $contract = null,
        public ?string $propertyType = null,
        public ?float $surfaceM2 = null,
        public ?int $bedrooms = null,
        public ?string $location = null,
    ) {}
}
