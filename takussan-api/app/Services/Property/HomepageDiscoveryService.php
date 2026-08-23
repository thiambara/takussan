<?php

namespace App\Services\Property;

use App\Models\Enums\ContractType;
use App\Models\Property;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * TCK-247 — assembles the four homepage discovery rows in one pass.
 *
 * The frontend used to fire four requests and drop the crossovers client-side.
 * Dropping is not refilling: measured on the development catalogue, the "À
 * louer" row asked for 12 cards and rendered 6, because half its ids had
 * already been claimed by "Près de toi". Deduplicating here lets each row pull
 * from a wider candidate pool and come back full.
 */
class HomepageDiscoveryService
{
    public const DEFAULT_PER_ROW = 10;

    public const MAX_PER_ROW = 20;

    /**
     * The city the "near you" row falls back to — both when the visitor's
     * location is unknown and when their city is too thin to fill a row.
     * It is the densest market in the catalogue by an order of magnitude
     * (measured on the development database: Dakar 493 addresses, Ziguinchor
     * 50, Mbour 27).
     */
    public const REFERENCE_CITY = 'Dakar';

    /**
     * Below this many listings in the visitor's own city, the "near you" row
     * switches ENTIRELY to {@see self::REFERENCE_CITY} — and says so, so the
     * frontend can retitle it (see the `fallback` / `city` keys below).
     *
     * Why four, and why a whole-row switch rather than a top-up:
     *
     * - Four is what the row physically shows at once. The `standard` card is
     *   290px wide on a 24px gutter (step 314px) inside a 1440px shell with
     *   48px of padding, so the widest supported desktop viewport fits
     *   ⌊1344/314⌋ = 4 cards before the first scroll. A row that cannot fill
     *   its own visible width reads as broken, not as sparse.
     * - Topping a local row up with listings from elsewhere was rejected on
     *   purpose: the row title names a city, and a title that names Ziguinchor
     *   above Dakar listings is simply false. Showing the two or three genuine
     *   local listings was rejected too — a visitor abroad would land on an
     *   empty first row. Switching wholesale keeps the row full AND the title
     *   honest, which is why the response reports which city it actually used.
     *
     * Clamped by `per_row`: a caller asking for 2 cards must not be told its
     * city is too thin to fill a row of 2.
     */
    public const NEAR_ROW_MIN_ITEMS = 4;

    /**
     * Each row fetches this many times `per_row` candidates so it can refill
     * after the rows above it have claimed their ids. Ceiling, not a promise:
     * beyond it a row is allowed to come back short rather than scan the
     * whole catalogue (the ticket's explicit trade-off).
     */
    private const CANDIDATE_POOL_FACTOR = 3;

    /**
     * @return array{
     *     near: array{items: Collection<int, Property>, city: string, requested_city: string|null, fallback: bool},
     *     rent: array{items: Collection<int, Property>},
     *     featured: array{items: Collection<int, Property>},
     *     latest: array{items: Collection<int, Property>},
     * }
     */
    public function discover(?string $requestedCity, int $perRow): array
    {
        $poolSize = $perRow * self::CANDIDATE_POOL_FACTOR;

        $near = $this->resolveNearRow($requestedCity, $perRow, $poolSize);

        $rentCandidates = $this->ranked(
            $this->baseQuery()->where('contract_type', ContractType::Rent)
        )->limit($poolSize)->pluck('id')->all();

        $latestCandidates = $this->baseQuery()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($poolSize)
            ->pluck('id')
            ->all();

        $featuredCandidates = $this->ranked(
            $this->baseQuery()->where('featured', true)
        )->limit($poolSize)->pluck('id')->all();

        // Dedup runs near → rent → latest, the order the client used, so the
        // ticket's "one row per property" rule does not silently reshuffle what
        // visitors see today. `featured` is curated: it neither consumes nor
        // contributes to the seen set, because a weekly pick that is also a
        // Dakar rental legitimately belongs to three rows at once.
        $seen = [];
        $nearIds = $this->claim($near['candidates'], $perRow, $seen);
        $rentIds = $this->claim($rentCandidates, $perRow, $seen);
        $latestIds = $this->claim($latestCandidates, $perRow, $seen);
        $featuredIds = array_slice($featuredCandidates, 0, $perRow);

        $properties = $this->hydrate([...$nearIds, ...$rentIds, ...$latestIds, ...$featuredIds]);

        $nearItems = $this->inOrder($nearIds, $properties);

        return [
            'near' => [
                'items' => $nearItems,
                // The catalogue's own spelling of the city, not the visitor's:
                // it is what the frontend prints in the row title. Falls back
                // to the requested string only when the row came back empty.
                'city' => $nearItems->first()?->address?->city ?? $near['city'],
                'requested_city' => $requestedCity,
                'fallback' => $near['fallback'],
            ],
            'rent' => ['items' => $this->inOrder($rentIds, $properties)],
            'featured' => ['items' => $this->inOrder($featuredIds, $properties)],
            'latest' => ['items' => $this->inOrder($latestIds, $properties)],
        ];
    }

    /**
     * @return array{candidates: list<int>, city: string, fallback: bool}
     */
    private function resolveNearRow(?string $requestedCity, int $perRow, int $poolSize): array
    {
        $threshold = min(self::NEAR_ROW_MIN_ITEMS, $perRow);

        if ($requestedCity !== null) {
            $isReference = mb_strtolower($requestedCity) === mb_strtolower(self::REFERENCE_CITY);
            $candidates = $this->cityCandidates($requestedCity, $poolSize);

            // A thin *reference* city is not a fallback — there is nowhere
            // better to send the visitor, and flipping the flag would make the
            // frontend retitle a row that never moved.
            if ($isReference || count($candidates) >= $threshold) {
                return ['candidates' => $candidates, 'city' => $requestedCity, 'fallback' => false];
            }
        }

        return [
            'candidates' => $this->cityCandidates(self::REFERENCE_CITY, $poolSize),
            'city' => self::REFERENCE_CITY,
            // Not knowing where the visitor is (`null`) is the nominal default,
            // not a fallback: there is no local row to have replaced.
            'fallback' => $requestedCity !== null,
        ];
    }

    /** @return list<int> */
    private function cityCandidates(string $city, int $poolSize): array
    {
        return $this->ranked(
            $this->baseQuery()->whereHas(
                'address',
                // Case-insensitive on purpose, and the reason has changed TWICE.
                //
                // It first read: "MySQL 8 compares `utf8mb4_0900_ai_ci` case- and
                // accent-insensitively while SQLite — the engine the suite runs on —
                // compares bytes", so `LOWER()` made the two agree. There is now ONE
                // engine (ADR-0020), so `LOWER()` is no longer a bridge between two of
                // them: it is the only thing making this lookup case-insensitive at all.
                //
                // Then the form itself turned out to be wrong. `lower()` borrows its
                // argument's collation, and under `--locale=C` it folds ASCII A-Z ONLY.
                // Measured on the running container on 2026-08-22:
                //
                //     SELECT lower('THIÈS') = 'thiès';   →  f
                //
                // A city STORED as `THIÈS` was therefore invisible to a visitor
                // geolocated to `Thiès`: the "near you" row silently fell back to Dakar
                // with `fallback: true`, and nothing anywhere raised. `near_city` is free
                // text from IP geolocation (see the FormRequest), so its casing belongs
                // to the provider, not to us. ADR-0025 is the fix, and
                // `CaseInsensitive::sql()`/`fold()` are its two halves — the SQL side and
                // the PHP side have to fold identically or the defect just moves.
                //
                // ⚠ THE DIRECTION MATTERS, and the test written for this had it backwards
                // at first — it stored `Thiès`, asked for `THIÈS`, and PASSED.
                // `lower('Thiès')` does give `thiès`: the `è` is already lowercase, only
                // the `T` is folded. It is `lower('THIÈS')` that gives `thiÈs`.
                //
                // ⚠ What this still does NOT do: fold ACCENTS. `Thies` does not match
                // `Thiès`, and it did under `ai_ci`. That is a deliberate, separate
                // decision (ADR-0020 §2 declines to install `unaccent` without a ticket),
                // not an oversight of ADR-0025.
                fn (Builder $q) => $q->whereRaw(
                    CaseInsensitive::sql('city').' = ?',
                    [CaseInsensitive::fold($city)],
                )
            )
        )->limit($poolSize)->pluck('id')->all();
    }

    private function baseQuery(): Builder
    {
        // `scopePublic()` already excludes Draft — along with Sold, Rented,
        // Archived, UnderMaintenance, Unavailable, PendingReview and Rejected —
        // so the extra `whereNot('status', Draft)` the neighbouring endpoints
        // carry would be dead weight here.
        //
        // ⚠ Nothing user-dependent may ever be eager-loaded on this query.
        // `PropertyResource` reveals a collaborator's email only to an
        // authenticated viewer; loading `collaborators` would make the payload
        // vary per user while the endpoint is served `Cache-Control: public`,
        // i.e. it would hand one visitor's data to the next from a shared cache.
        return Property::query()->public();
    }

    private function ranked(Builder $query): Builder
    {
        // `featured DESC, published_at DESC` matches the public index and the
        // empty-query branch of the search service. The `id` tiebreaker is not
        // decoration: seeders and factories publish many rows within the same
        // second, and two engines do not resolve such ties the same way.
        return $query
            ->orderByDesc('featured')
            ->orderByDesc('published_at')
            ->orderByDesc('id');
    }

    /**
     * Takes the first `$limit` unclaimed candidates and marks them claimed.
     *
     * @param  list<int>  $candidates
     * @param  array<int, true>  $seen
     * @return list<int>
     */
    private function claim(array $candidates, int $limit, array &$seen): array
    {
        $picked = [];

        foreach ($candidates as $id) {
            if (isset($seen[$id])) {
                continue;
            }

            $picked[] = $id;
            $seen[$id] = true;

            if (count($picked) === $limit) {
                break;
            }
        }

        return $picked;
    }

    /**
     * One hydration query for the whole page instead of one per row: the
     * candidate passes above select ids only, so `address` and `media` are
     * eager-loaded once, over the union, after dedup has cut the working set
     * down to at most 4 × `per_row` rows.
     *
     * @param  list<int>  $ids
     * @return Collection<int, Property>
     */
    private function hydrate(array $ids): Collection
    {
        $unique = array_values(array_unique($ids));

        if ($unique === []) {
            return new Collection;
        }

        return Property::query()
            ->with('address', 'media')
            ->whereIn('id', $unique)
            ->get()
            ->keyBy('id');
    }

    /**
     * @param  list<int>  $ids
     * @param  Collection<int, Property>  $properties
     * @return Collection<int, Property>
     */
    private function inOrder(array $ids, Collection $properties): Collection
    {
        return (new Collection($ids))
            ->map(fn (int $id) => $properties->get($id))
            ->filter()
            ->values();
    }
}
