<?php

namespace App\Services\Radar\Targets;

use App\Models\Enums\RadarSourceSite;
use App\Models\Enums\RadarTargetStatus;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\RentPeriod;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\RadarListing;
use App\Models\RadarTarget;
use App\Services\Geo\GeoNeighborhoodResolver;
use App\Services\Radar\Crawl\ListCard;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * TCK-2468 (ADR-0087 §5) — une carte ou une annonce face aux critères des cibles. Deux lectures, et elles ne se
 * ressemblent pas exprès :
 *
 * **La carte, PERMISSIVE** ({@see self::mayMatchCard()}) : une valeur que la carte ne montre pas ne l'exclut jamais (prix
 * absent ≠ hors fourchette). Une carte n'est écartée que par une valeur lue qui contredit un critère : type, contrat, prix
 * (seulement un loyer mensuel ou une vente — un loyer à la journée ne se compare pas à une fourchette mensuelle), chambres,
 * lieu. Le lieu d'une carte est un texte libre (« Almadies, Dakar ») : il ne l'exclut que s'il nomme un AUTRE quartier
 * (ou une autre ville) du référentiel sans nommer aucun de ceux de la cible. Meublé et fraîcheur ne se lisent pas sur une
 * carte.
 *
 * **L'annonce extraite, STRICTE** ({@see self::matchingTargets()}) : chaque critère posé exige une valeur connue qui le
 * remplit — un prix inconnu ne remplit pas une fourchette. Seule exception, la fraîcheur : aucune lecture ne rend encore la
 * date de publication d'une annonce ; à défaut de `extracted.published_at`, son âge est celui de sa première saisie
 * (`created_at`), une borne basse : une annonce vue il y a plus longtemps que la fraîcheur est écartée.
 *
 * **Le quartier** se compare par la clé du référentiel de `RadarNeighborhoodMatcher`
 * ({@see GeoNeighborhoodResolver::cle()} : casse repliée par `CaseInsensitive` — jamais `strtolower()` —, blancs, tirets
 * et apostrophes ; accents distincts). Une annonce rattachée à un quartier (`neighborhood.neighborhood_id`) est comparée
 * par le nom de ce quartier et de sa ville ; sinon par le texte lu (`neighborhood.value`, `city.value`). La ville d'un
 * critère de quartier ne départage que si celle de l'annonce est connue.
 *
 * Toutes les clés d'une cible sont des contraintes indépendantes (ET) : `cities` ET `neighborhoods` exigent les deux.
 * Une cible ne concerne que les sites de `criteria.sites` (vide : tous).
 */
final class RadarTargetMatcher
{
    /** @var array<string, Collection<int, RadarTarget>> les cibles actives par site, lues une fois par instance */
    private array $active = [];

    /** @var array{neighborhoods: list<string>, cities: list<string>}|null les noms du référentiel, en mots repliés */
    private ?array $referential = null;

    /** Oublie ce qui a été lu (cibles, référentiel) : un passage de collecte repart des cibles du moment. */
    public function forget(): void
    {
        $this->active = [];
        $this->referential = null;
    }

    /**
     * Les cibles actives qui concernent ce site (`criteria.sites` vide ou le contenant), lues une fois par instance.
     *
     * @return Collection<int, RadarTarget>
     */
    public function activeFor(RadarSourceSite $site): Collection
    {
        return $this->active[$site->value] ??= self::concerning(
            RadarTarget::query()->where('status', RadarTargetStatus::Active->value)->orderBy('id')->get(),
            $site->value,
        );
    }

    /** Vrai si la carte peut correspondre à au moins une cible active de ce site. */
    public function mayMatchCard(ListCard $card, RadarSourceSite $site): bool
    {
        foreach ($this->activeFor($site) as $target) {
            if ($this->cardMayMatch($card, (array) $target->criteria)) {
                return true;
            }
        }

        return false;
    }

    /** @param  array<string, mixed>  $c  critères normalisés */
    public function cardMayMatch(ListCard $card, array $c): bool
    {
        if (($c['types'] ?? []) !== [] && $card->propertyType !== null && ! in_array($card->propertyType, $c['types'], true)) {
            return false;
        }
        if (($c['contract'] ?? null) !== null && $card->contract !== null && $card->contract !== $c['contract']) {
            return false;
        }
        $comparablePrice = $card->price !== null && ($card->rentPeriod === null || $card->rentPeriod === RentPeriod::Monthly->value);
        if ($comparablePrice && ! self::within($card->price, $c['price_min'] ?? null, $c['price_max'] ?? null)) {
            return false;
        }
        if ($card->bedrooms !== null && ! self::within($card->bedrooms, $c['bedrooms_min'] ?? null, $c['bedrooms_max'] ?? null)) {
            return false;
        }

        return $this->locationMayMatch($card->location, $c);
    }

    /**
     * Les cibles ACTIVES dont l'annonce remplit strictement les critères, et qui concernent son site.
     *
     * @return Collection<int, RadarTarget>
     */
    public function matchingTargets(RadarListing $listing): Collection
    {
        $site = $listing->source_site?->value;
        $active = RadarTarget::query()->where('status', RadarTargetStatus::Active->value)->orderBy('id')->get();
        if ($active->isEmpty()) {
            return $active;
        }
        $facts = $this->facts($listing);

        return self::concerning($active, $site)
            ->filter(fn (RadarTarget $t): bool => self::listingMatches($facts, (array) $t->criteria))
            ->values();
    }

    /**
     * @param  Collection<int, RadarTarget>  $targets
     * @return Collection<int, RadarTarget>
     */
    private static function concerning(Collection $targets, ?string $site): Collection
    {
        return $targets->filter(function (RadarTarget $t) use ($site): bool {
            $sites = (array) ($t->criteria['sites'] ?? []);

            return $sites === [] || ($site !== null && in_array($site, $sites, true));
        })->values();
    }

    private static function within(int|float $value, ?int $min, ?int $max): bool
    {
        return ($min === null || $value >= $min) && ($max === null || $value <= $max);
    }

    /** Un nom en mots repliés (clé du référentiel, toute ponctuation en espace) : « Almadies, Dakar » → « almadies dakar ». */
    private static function words(?string $text): string
    {
        return trim((string) preg_replace('/[^\p{L}\p{N}]+/u', ' ', GeoNeighborhoodResolver::cle((string) $text)));
    }

    /** Le texte contient-il ce nom, mot pour mot ? */
    private static function names(string $haystack, string $name): bool
    {
        return $name !== '' && str_contains(' '.$haystack.' ', ' '.$name.' ');
    }

    /** @param  array<string, mixed>  $c */
    private function locationMayMatch(?string $location, array $c): bool
    {
        $cities = array_map(self::words(...), (array) ($c['cities'] ?? []));
        $neighborhoods = array_map(static fn (array $n): string => self::words($n['name'] ?? ''), (array) ($c['neighborhoods'] ?? []));
        $text = self::words($location);
        if ($text === '' || ($cities === [] && $neighborhoods === [])) {
            return true;
        }

        $referential = $this->referential();
        foreach ([[$neighborhoods, $referential['neighborhoods']], [$cities, $referential['cities']]] as [$wanted, $known]) {
            if ($wanted === [] || array_filter($wanted, fn (string $w): bool => self::names($text, $w)) !== []) {
                continue;
            }
            // Aucun des noms voulus : la carte n'est écartée que si elle en nomme un autre du référentiel.
            foreach ($known as $other) {
                if (! in_array($other, $wanted, true) && self::names($text, $other)) {
                    return false;
                }
            }
        }

        return true;
    }

    /** @return array{neighborhoods: list<string>, cities: list<string>} */
    private function referential(): array
    {
        return $this->referential ??= [
            'neighborhoods' => GeoNeighborhood::query()
                ->where('status', ReferentialStatus::Approved->value)->whereNull('merged_into_id')
                ->pluck('name')->map(fn (mixed $n): string => self::words((string) $n))->filter()->unique()->values()->all(),
            'cities' => GeoCity::query()->pluck('name')
                ->map(fn (mixed $n): string => self::words((string) $n))->filter()->unique()->values()->all(),
        ];
    }

    /**
     * Ce que l'annonce dit, lu une fois : les valeurs de `extracted`, et les lieux en mots repliés.
     *
     * @return array<string, mixed>
     */
    private function facts(RadarListing $listing): array
    {
        $e = (array) ($listing->extracted ?? []);
        $value = static fn (string $field): mixed => is_array($e[$field] ?? null) ? ($e[$field]['value'] ?? null) : null;

        $places = [];
        $neighborhoodId = $e['neighborhood']['neighborhood_id'] ?? null;
        if (is_int($neighborhoodId)) {
            $neighborhood = GeoNeighborhood::query()->with('city:id,name')->find($neighborhoodId)?->canonique();
            if ($neighborhood !== null) {
                $places[] = ['name' => self::words($neighborhood->name), 'city' => self::words($neighborhood->city?->name)];
            }
        }
        $cityText = self::words(is_string($value('city')) ? $value('city') : null);
        if (is_string($value('neighborhood'))) {
            $places[] = ['name' => self::words($value('neighborhood')), 'city' => $cityText];
        }
        $cities = array_values(array_filter(array_unique([$cityText, ...array_column($places, 'city')])));

        $published = $value('published_at');
        $seen = is_string($published) && strtotime($published) !== false ? Carbon::parse($published) : $listing->created_at;

        return [
            'type' => $value('property_type'),
            'contract' => $value('contract'),
            'rent_period' => $value('rent_period'),
            'price' => is_int($value('price')) || is_float($value('price')) ? $value('price') : null,
            'bedrooms' => is_int($value('bedrooms')) ? $value('bedrooms') : null,
            'furnished' => is_bool($value('furnished')) ? $value('furnished') : null,
            'places' => array_values(array_filter($places, static fn (array $p): bool => $p['name'] !== '')),
            'cities' => $cities,
            'seen_at' => $seen,
        ];
    }

    /**
     * @param  array<string, mixed>  $f  {@see self::facts()}
     * @param  array<string, mixed>  $c  critères normalisés
     */
    private static function listingMatches(array $f, array $c): bool
    {
        if (($c['types'] ?? []) !== [] && ! in_array($f['type'], $c['types'], true)) {
            return false;
        }
        if (($c['contract'] ?? null) !== null && $f['contract'] !== $c['contract']) {
            return false;
        }
        if (($c['price_min'] ?? null) !== null || ($c['price_max'] ?? null) !== null) {
            // Un loyer à la journée, à la semaine ou à l'année ne se compare pas à une fourchette mensuelle.
            $monthly = $f['contract'] === 'sale' || $f['rent_period'] === null || $f['rent_period'] === RentPeriod::Monthly->value;
            if ($f['price'] === null || ! $monthly || ! self::within($f['price'], $c['price_min'] ?? null, $c['price_max'] ?? null)) {
                return false;
            }
        }
        if ((($c['bedrooms_min'] ?? null) !== null || ($c['bedrooms_max'] ?? null) !== null)
            && ($f['bedrooms'] === null || ! self::within($f['bedrooms'], $c['bedrooms_min'] ?? null, $c['bedrooms_max'] ?? null))) {
            return false;
        }
        if (($c['furnished'] ?? null) !== null && $f['furnished'] !== $c['furnished']) {
            return false;
        }
        if (($c['max_age_days'] ?? null) !== null
            && ($f['seen_at'] === null || $f['seen_at']->lt(now()->subDays((int) $c['max_age_days'])))) {
            return false;
        }

        $cities = array_map(self::words(...), (array) ($c['cities'] ?? []));
        if ($cities !== [] && array_intersect($cities, $f['cities']) === []) {
            return false;
        }

        $wanted = (array) ($c['neighborhoods'] ?? []);
        if ($wanted === []) {
            return true;
        }
        foreach ($wanted as $n) {
            $name = self::words($n['name'] ?? '');
            $city = self::words($n['city'] ?? null);
            foreach ($f['places'] as $place) {
                if ($place['name'] === $name && ($city === '' || $place['city'] === '' || $place['city'] === $city)) {
                    return true;
                }
            }
        }

        return false;
    }
}
