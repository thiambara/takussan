<?php

namespace App\Services\Radar\Crawl;

use Carbon\CarbonImmutable;

/**
 * TCK-2465 (ADR-0087 §1) — ce que la page d'une annonce dit en clair, lu par l'adaptateur de son site, sans IA. Une
 * valeur absente de la page reste nulle : rien n'est deviné. Une valeur lue ainsi fait foi.
 *
 * - `phones` : E.164 (`RadarPhone::canonical()`), dans l'ordre de la page, jamais un numéro du site lui-même ;
 * - `photoUrls` : la galerie, dans son ordre, `https` et hôtes d'images déclarés par l'adaptateur seulement ;
 * - `price` : un entier XOF, `currency` la devise lue (`XOF`) ;
 * - `contract`, `propertyType`, `rentPeriod` : les valeurs du Radar (`rent`/`sale`, `PropertyType`, `month`…) ;
 * - `rooms` : le nombre de PIÈCES quand la page le dit (CoinAfrique) — ce n'est pas le nombre de chambres ;
 * - `sellerSignals` : `{signal, evidence}`, la forme des `nature_signals` de l'extraction ;
 * - `description` : le texte de l'annonce seule, sans menu ni bloc du site.
 */
final readonly class ListingPage
{
    /**
     * @param  list<string>  $phones
     * @param  list<string>  $photoUrls
     * @param  list<array{signal: string, evidence: ?string}>  $sellerSignals
     */
    public function __construct(
        public array $phones = [],
        public array $photoUrls = [],
        public ?int $price = null,
        public ?string $currency = null,
        public ?string $contract = null,
        public ?string $propertyType = null,
        public ?string $rentPeriod = null,
        public ?string $city = null,
        public ?string $neighborhood = null,
        public ?int $bedrooms = null,
        public ?int $rooms = null,
        public ?int $bathrooms = null,
        public ?float $surfaceM2 = null,
        public ?bool $furnished = null,
        public ?CarbonImmutable $postedAt = null,
        public ?string $sellerName = null,
        public array $sellerSignals = [],
        public ?string $title = null,
        public ?string $description = null,
    ) {}

    /** Le texte gardé dans `raw_text` : le titre, puis la description. */
    public function text(): string
    {
        $title = trim((string) $this->title);
        $description = trim((string) $this->description);

        return trim($title !== '' && ! str_contains($description, $title) ? $title."\n".$description : $description);
    }

    /**
     * Ce qui se garde dans `radar_listings.source_fields` : tout, sauf la description (déjà dans `raw_text`) et la galerie
     * (déjà dans `photo_urls`). Chaque clé est présente, nulle si la page ne la dit pas.
     *
     * @return array<string, mixed>
     */
    public function sourceFields(): array
    {
        return [
            'phones' => $this->phones,
            'price' => $this->price,
            'currency' => $this->currency,
            'contract' => $this->contract,
            'property_type' => $this->propertyType,
            'rent_period' => $this->rentPeriod,
            'city' => $this->city,
            'neighborhood' => $this->neighborhood,
            'bedrooms' => $this->bedrooms,
            'rooms' => $this->rooms,
            'bathrooms' => $this->bathrooms,
            'surface_m2' => $this->surfaceM2,
            'furnished' => $this->furnished,
            'posted_at' => $this->postedAt?->toIso8601String(),
            'seller_name' => $this->sellerName,
            'seller_signals' => $this->sellerSignals,
            'title' => $this->title,
        ];
    }
}
