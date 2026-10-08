<?php

namespace App\Http\Controllers\Public;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Booking\BookingRequested;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\ListSimilarPropertiesRequest;
use App\Http\Requests\Public\BookingRequestPublicPropertyRequest;
use App\Http\Requests\Public\ByIdsPublicPropertyRequest;
use App\Http\Requests\Public\ComparePublicPropertyRequest;
use App\Http\Requests\Public\ContactClickPublicRequest;
use App\Http\Requests\Public\ContactLeadPublicRequest;
use App\Http\Requests\Public\ContactMessagePublicPropertyRequest;
use App\Http\Requests\Public\HomepageDiscoveryRequest;
use App\Http\Requests\Public\MapPublicPropertyRequest;
use App\Http\Requests\Public\NeighborhoodsPublicPropertyRequest;
use App\Http\Requests\Public\ReportPublicPropertyRequest;
use App\Http\Requests\Public\SearchPublicPropertyRequest;
use App\Http\Requests\Public\VisitRequestPublicPropertyRequest;
use App\Http\Requests\Public\VisitSlotsPublicPropertyRequest;
use App\Http\Resources\BookingResource;
use App\Http\Resources\PropertyMapGeoJsonResource;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\PropertySitemapResource;
use App\Http\Resources\PropertyVisitResource;
use App\Http\Resources\ReviewResource;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\MessageType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Booking\BookingQuote;
use App\Services\Booking\PropertyAvailabilityService;
use App\Services\Lead\ContactLeadService;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Messaging\PropertyConversationResolver;
use App\Services\Model\CustomerService;
use App\Services\Model\NotificationService;
use App\Services\Property\EtatPublicDuBien;
use App\Services\Property\HomepageDiscoveryService;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Property\PropertyViewCounter;
use App\Services\Property\SimilarPropertiesService;
use App\Services\Search\PropertySearchService;
use App\Services\Visit\VisitNotifier;
use App\Services\Visit\VisitSchedulingService;
use App\Support\CaseInsensitive;
use App\Support\DistanceHaversine;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PublicPropertyController extends Controller
{
    /**
     * Maximum number of features returned by the /public/properties/map endpoint.
     * Caps payload size for wide viewports; clients should tighten bounds or
     * apply filters when truncated.
     */
    public const MAP_MAX_RESULTS = 500;

    /**
     * Maximum number of properties returned by the /public/properties/compare
     * endpoint. Matches the frontend comparator cap (TCK-082).
     */
    public const COMPARE_MAX_IDS = 4;

    /**
     * Maximum number of properties returned by the /public/properties/by-ids
     * endpoint. Matches the recently-viewed cap on the frontend (TCK-100).
     */
    public const BY_IDS_MAX_IDS = 20;

    /**
     * Plafond dur de `GET /public/properties/sitemap` (TCK-431). Le front pagine dessus
     * (`takussan-web/src/lib/queries/sitemap-catalogue.ts` : `TAILLE_DE_PAGE_SITEMAP`).
     */
    public const SITEMAP_MAX_PER_PAGE = 1000;

    /**
     * TCK-598 (V16) — plafonds de `index()` et `reviews()`, deux routes anonymes qui acceptaient
     * n'importe quel `per_page`. Repli (*clamp*) et non 422, comme `sitemap()` : une valeur hors
     * bornes est ramenée, jamais refusée — le front n'a pas à connaître le plafond pour paginer.
     */
    public const INDEX_MAX_PER_PAGE = 48;

    public const REVIEWS_MAX_PER_PAGE = 50;

    /** Repli du plafond de `neighborhoods()`, si la configuration disparaissait (même patron que `cities`). */
    public const NEIGHBORHOODS_MAX_DEFAUT = 300;

    /**
     * Repli du plafond de `GET /public/properties/cities`, si la configuration disparaissait.
     *
     * La valeur qui fait foi vit dans `config/catalogue.php` — pas ici — pour que son BORD soit
     * éprouvable : un test l'abaisse à 2 et mesure la troncature avec trois biens, là où
     * l'éprouver à 500 coûterait 501 insertions. *Un seuil qu'on ne peut pas atteindre en test
     * est un seuil qu'on ne teste pas.*
     */
    public const CITIES_MAX_DEFAUT = 500;

    /** Le plafond effectif. */
    public static function citiesMax(): int
    {
        return (int) config('catalogue.cities_max', self::CITIES_MAX_DEFAUT);
    }

    /** Le plafond effectif du domaine des quartiers, par ville. */
    public static function neighborhoodsMax(): int
    {
        return (int) config('catalogue.neighborhoods_max', self::NEIGHBORHOODS_MAX_DEFAUT);
    }

    /** `per_page` ramené dans `1..$max`, `$defaut` s'il est absent. */
    private static function parPage(Request $request, int $defaut, int $max): int
    {
        return max(1, min((int) $request->input('per_page', $defaut), $max));
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Property::query()
            ->with('address', 'media')
            ->public()
            ->whereNot('status', PropertyStatus::Draft);

        if ($request->boolean('featured')) {
            $query->where('featured', true);
        }

        if ($request->input('sort') === 'created_desc') {
            $query->orderByDesc('created_at');
        } else {
            $query->orderByDesc('featured')->orderByDesc('published_at');
        }

        $properties = $query->paginate(self::parPage($request, 20, self::INDEX_MAX_PER_PAGE));

        return PropertyResource::collection($properties);
    }

    /**
     * L'énumération du catalogue indexable, pour `/sitemap.xml` du site public (TCK-431).
     *
     * GET /api/public/properties/sitemap?page=…&per_page=…
     *
     * **Trois décisions, chacune contre un mode de défaillance mesuré.**
     *
     * 1. **`scopePublic()` SEUL décide de ce qui entre.** C'est déjà le prédicat qui décide de ce
     *    qu'une fiche publique sert : réécrire ici la condition « publié » ferait diverger le
     *    sitemap de la fiche, et un sitemap qui annonce des URL rendant 404 est pire que pas de
     *    sitemap. `index()` ci-dessus y ajoute `whereNot(status, Draft)` — redondant, `public()`
     *    exclut déjà `Draft` avec sept autres statuts.
     *
     * 2. **`per_page` est PLAFONNÉ.** Sur une route anonyme qui énumère tout le catalogue, une
     *    valeur libre serait une invitation à demander le catalogue entier d'un coup. Le plafond
     *    est aussi un contrat avec le front, qui pagine dessus
     *    (`takussan-web/src/lib/queries/sitemap-catalogue.ts`).
     *
     * 3. **`orderBy('id')` — un ordre TOTAL et STABLE.** `index()` trie par `featured` puis
     *    `published_at`, deux colonnes non uniques : sous PostgreSQL, deux pages successives d'un
     *    tel tri peuvent rendre deux fois la même ligne et jamais une autre, sans que rien ne
     *    rougisse. Pour une énumération complète, l'ordre doit départager toutes les lignes.
     */
    public function sitemap(Request $request): JsonResponse
    {
        $perPage = (int) $request->input('per_page', self::SITEMAP_MAX_PER_PAGE);
        $perPage = max(1, min($perPage, self::SITEMAP_MAX_PER_PAGE));

        $properties = Property::query()
            ->public()
            ->select(['id', 'slug', 'updated_at'])
            ->orderBy('id')
            ->paginate($perPage);

        return $this->paginated($properties, PropertySitemapResource::collection($properties->getCollection()));
    }

    /**
     * Les VILLES du catalogue public — le domaine de la facette `city` (TCK-433, passe 2).
     *
     * GET /api/public/properties/cities
     *
     * ────────────────────────────────────────────────────────────────────────────────────────
     * POURQUOI CET ENDPOINT EXISTE
     * ────────────────────────────────────────────────────────────────────────────────────────
     *
     * `src/lib/canonique.ts` retient `contract_type`, `type` et `city` comme facettes
     * indexables **parce que leur ensemble de valeurs est fini et énumérable**. Les deux
     * premiers le sont côté front (`propertyTypeValues`, `contractTypeValues`). La troisième ne
     * l'était nulle part : `?city=Zzzinventee` produisait une URL indexable, canonique
     * d'elle-même, avec un titre dérivé de la valeur fournie. *Un ensemble énumérable dont
     * personne ne vérifie l'appartenance n'est pas un ensemble fini, c'est une intention.*
     *
     * Il rend donc l'ÉNUMÉRATION, sur le même patron que `PublicPropertyTypeController::index()`
     * dont il est le jumeau : `->public()` décide, un compte accompagne chaque valeur.
     *
     * ⚠ La ville vit sur `addresses`, pas sur `properties` : d'où la jointure. `->public()`
     * s'applique bien à la requête de `properties`, donc le domaine ne contient que des villes
     * réellement atteignables par une fiche publique — une ville dont toutes les annonces sont
     * retirées quitte le domaine, et sa page de facette cesse d'être canonique d'elle-même.
     * C'est le comportement voulu.
     */
    public function cities(): JsonResponse
    {
        $lignes = Property::query()
            ->public()
            ->join('addresses', function ($jointure) {
                $jointure->on('addresses.addressable_id', '=', 'properties.id')
                    ->where('addresses.addressable_type', '=', Property::class);
            })
            ->whereNotNull('addresses.city')
            ->where('addresses.city', '!=', '')
            ->groupBy('addresses.city')
            ->orderByDesc(DB::raw('count(*)'))
            ->limit(self::citiesMax() + 1)
            ->pluck(DB::raw('count(*) as cnt'), 'addresses.city');

        $tronque = $lignes->count() > self::citiesMax();

        $data = $lignes->take(self::citiesMax())
            ->map(fn ($compte, $ville) => ['value' => (string) $ville, 'count' => (int) $compte])
            ->values()
            ->all();

        return $this->json([
            'data' => $data,
            // ⚠ Un domaine tronqué n'est PAS un domaine. L'appelant doit pouvoir refuser de s'en
            // servir plutôt que de rejeter en silence les villes qui n'ont pas tenu.
            'meta' => ['truncated' => $tronque],
        ]);
    }

    /**
     * Les QUARTIERS d'une ville du catalogue public — le domaine de la clé canonique `location`
     * (TCK-598, V14, contrainte 12). Jumeau de `cities()`, borné par ville.
     *
     * GET /api/public/properties/neighborhoods?city=Dakar
     *
     * ⚠ **Le quartier est saisi à la main, et ses variantes de casse se fondent** : « Mermoz » et
     * « MERMOZ » sont UNE entrée, comptée deux. Le repli passe par `CaseInsensitive` (piège n°9 du
     * `CLAUDE.md`) : `lower()` nu laisserait « MÉDINA » et « Médina » séparés. La ville se compare
     * de la même façon. La graphie rendue est la plus fréquente (`mode()`), à égalité la première
     * dans l'ordre de la collation.
     *
     * Le domaine sert à décider qu'une page de quartier est canonique : il ne contient donc que ce
     * que `->public()` laisse atteindre, comme `cities()`.
     */
    public function neighborhoods(NeighborhoodsPublicPropertyRequest $request): JsonResponse
    {
        $replie = CaseInsensitive::sql('addresses.neighborhood');
        $max = self::neighborhoodsMax();

        $lignes = Property::query()
            ->public()
            ->join('addresses', function ($jointure) {
                $jointure->on('addresses.addressable_id', '=', 'properties.id')
                    ->where('addresses.addressable_type', '=', Property::class);
            })
            ->whereRaw(CaseInsensitive::sql('addresses.city').' = ?', [CaseInsensitive::fold($request->city())])
            ->whereNotNull('addresses.neighborhood')
            ->whereRaw("trim(addresses.neighborhood) != ''")
            ->groupByRaw($replie)
            ->orderByDesc(DB::raw('count(*)'))
            ->orderByRaw($replie)
            ->limit($max + 1)
            ->get([
                DB::raw('mode() WITHIN GROUP (ORDER BY addresses.neighborhood) as valeur'),
                DB::raw('count(*) as compte'),
            ]);

        return $this->json([
            'data' => $lignes->take($max)
                ->map(fn ($l) => ['value' => trim((string) $l->valeur), 'count' => (int) $l->compte])
                ->values()
                ->all(),
            'meta' => ['truncated' => $lignes->count() > $max],
        ]);
    }

    /**
     * TCK-247 — the four homepage discovery rows in a single round-trip.
     *
     * GET /api/public/properties/discovery?near_city=…&per_row=…
     *
     * `near` carries the city it actually used plus a `fallback` flag: when the
     * visitor's geolocated city is too thin to fill a row, the row switches
     * wholesale to the reference city and the frontend retitles it from that
     * data rather than guessing. The API emits codes and data, never labels
     * (root CLAUDE.md, non-negotiable #5).
     */
    public function discovery(HomepageDiscoveryRequest $request, HomepageDiscoveryService $service): JsonResponse
    {
        $rows = $service->discover($request->nearCity(), $request->perRow());

        $items = fn (Collection $properties) => PropertyResource::collection($properties)->toArray($request);

        return $this->json([
            'data' => [
                'near' => [
                    'items' => $items($rows['near']['items']),
                    'city' => $rows['near']['city'],
                    'requested_city' => $rows['near']['requested_city'],
                    'fallback' => $rows['near']['fallback'],
                ],
                'rent' => ['items' => $items($rows['rent']['items'])],
                'featured' => ['items' => $items($rows['featured']['items'])],
                'latest' => ['items' => $items($rows['latest']['items'])],
            ],
            // `discovery` ne pagine pas : quatre rangées bornées, pas une liste. Elle n'a donc
            // aucune enveloppe de pagination à émettre (TCK-304).
            'meta' => ['per_row' => $request->perRow()],
        ], 200, [
            'Cache-Control' => 'public, max-age=60, s-maxage=300',
            // TCK-341 — le `Vary` est arrivé CINQ mois après le `public`, et le
            // commentaire qui tenait sa place affirmait exactement l'inverse de
            // ce que le code faisait : « the list shape of PropertyResource pins
            // its labels to `fr` and reads nothing off `$request->user()` ».
            // Les deux moitiés étaient fausses au moment où on les a lues.
            //
            //   · La LOCALE : `enumLabel()` traduit via le locale de la requête
            //     depuis TCK-335. Mesuré le 2026-08-21 sur `per_row=3`, md5 du
            //     corps : fr `2c3d8e8a…`, en `5b51577c…`, wo `858389fb…` —
            //     trois corps distincts servis `public, s-maxage=300` sous UNE
            //     seule entrée de cache. Un visiteur anglophone recevait la
            //     page d'un francophone, et rien ne pouvait le signaler.
            //   · L'APPELANT : `PropertyResource` émet quatre champs de
            //     modération dès que `$request->user() !== null`, et
            //     `ResolveActiveProfile` propage un porteur Bearer au garde par
            //     défaut sur tout `api/*` (TCK-179) — y compris sur cette route,
            //     qui ne porte pas `auth:sanctum`. Sans `Vary: Authorization`,
            //     un cache partagé peut stocker la variante authentifiée et la
            //     resservir anonymement, défaisant TCK-335 en silence.
            //
            // ⚠ `Origin` n'est PAS répété ici : le middleware CORS l'AJOUTE au
            // `Vary` existant sur chaque réponse. L'écrire en dur reviendrait à
            // parier sur cet ajout ; l'omettre du `set()` est ce qui garantit
            // qu'on ne l'écrase pas. Vérifié par requête réelle : la réponse
            // sort avec les trois valeurs.
            'Vary' => 'Accept-Language, Authorization',
        ]);
    }

    public function search(SearchPublicPropertyRequest $request, PropertySearchService $service): array
    {
        $validated = $request->validated();

        return $service->search($validated);
    }

    /**
     * TCK-082 — side-by-side property comparator.
     *
     * Fetches up to {@see self::COMPARE_MAX_IDS} published properties in a
     * single payload. Eager-loads `address`, `tags` and media needed by the
     * comparison grid. Unknown or unpublished ids are silently dropped so
     * the frontend can render a "no longer available" placeholder for them.
     */
    public function compare(ComparePublicPropertyRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $ids = collect(explode(',', (string) $validated['ids']))
            ->map(fn ($v) => (int) trim($v))
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->take(self::COMPARE_MAX_IDS)
            ->values();

        if ($ids->isEmpty()) {
            // Keep `returned_ids` in the empty payload so the frontend's
            // `returnedIds.length < requestedIds.length` check in
            // useCompare.ts can't hit `.length` on undefined.
            return $this->json([
                'data' => [],
                'meta' => ['requested_ids' => [], 'returned_ids' => []],
            ]);
        }

        $properties = Property::query()
            // TCK-502 — `owner` et `collaborators.user.media` sont chargés ICI parce que la
            // route est `$isDetail` pour `PropertyResource` : sans eux, `owner` et
            // `primary_contact` partaient en chargement paresseux, soit deux requêtes par bien
            // comparé. C'était déjà vrai d'`owner` avant ce ticket.
            // TCK-590 — les profils du collaborateur : l'éligibilité du contact se juge sur eux.
            ->with(['address', 'media', 'tags', 'owner.media', 'collaborators.user.media', 'collaborators.user.agentProfiles', 'collaborators.user.agencyAdminProfiles'])
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        $ordered = $ids
            ->map(fn (int $id) => $properties->get($id))
            ->filter()
            ->values();

        return $this->json([
            'data' => PropertyResource::collection($ordered)->toArray($request),
            'meta' => [
                'requested_ids' => $ids->all(),
                'returned_ids' => $ordered->pluck('id')->all(),
            ],
        ]);
    }

    /**
     * TCK-100 — batch fetch published properties by id (recently-viewed
     * carousel). Mirrors the contract of {@see self::compare()} but with a
     * larger cap and lighter eager-loads (no `tags`). Unknown / unpublished
     * ids are silently dropped so the frontend can purge ghost entries from
     * its local store.
     */
    public function byIds(ByIdsPublicPropertyRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $ids = collect(explode(',', (string) $validated['ids']))
            ->map(fn ($v) => (int) trim($v))
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->take(self::BY_IDS_MAX_IDS)
            ->values();

        if ($ids->isEmpty()) {
            return $this->json([
                'data' => [],
                'meta' => ['requested_ids' => [], 'returned_ids' => []],
            ]);
        }

        $properties = Property::query()
            ->with(['address', 'media'])
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        $ordered = $ids
            ->map(fn (int $id) => $properties->get($id))
            ->filter()
            ->values();

        return $this->json([
            'data' => PropertyResource::collection($ordered)->toArray($request),
            'meta' => [
                'requested_ids' => $ids->all(),
                'returned_ids' => $ordered->pluck('id')->all(),
            ],
        ]);
    }

    /**
     * Marqueurs GeoJSON dans un cadrage — et, depuis TCK-346, dans un rayon.
     *
     * ## Pourquoi le rayon transite jusqu'ici
     *
     * `/search` et `/map` sont deux endpoints sur deux moteurs, mais UN seul
     * écran : `PropertiesDiscoveryPage` bascule `list` ↔ `map` sans changer de
     * filtres. Tant que `/map` ignorait `radius_km`, poser « à moins de 3 km »
     * puis basculer en carte faisait réapparaître les biens que la liste venait
     * d'écarter — un filtre qui disparaît en silence, et deux comptes différents
     * pour la même recherche.
     *
     * ## Pourquoi il n'y a PAS de `sort=distance` ici
     *
     * Pesé, et écarté — trois raisons, la troisième étant la décisive :
     *
     * 1. La sortie est un `FeatureCollection` **sans pagination** : le client
     *    rend les N marqueurs d'un coup sur un fond de carte. L'ordre des
     *    entités n'est observable par personne.
     * 2. `sort` de `/search` est une énumération métier
     *    (`relevance|price_asc|price_desc|created_desc|distance`) qui n'a pas de
     *    sens sur un jeu de marqueurs. Un `sort` de `/map` serait donc une AUTRE
     *    énumération sous le même nom — la divergence de contrat que TCK-346
     *    existe pour supprimer.
     * 3. Il coûterait un haversine par ligne sur l'ensemble du cadrage, à chaque
     *    pan de carte, pour un classement invisible.
     *
     * ⚠ Ce qui rouvrirait la question : la TRONCATURE. Au-delà de
     * `MAP_MAX_RESULTS`, l'ensemble rendu est arbitraire, et un tri par distance
     * le rendrait signifiant (« les 500 plus proches »). Aujourd'hui la réponse
     * est ailleurs — `meta.truncated` le dit, et resserrer le cadrage ou le rayon
     * le corrige. Le jour où un écran rend la troncature ordinaire plutôt
     * qu'exceptionnelle, ce paragraphe est le point de reprise.
     */
    public function map(MapPublicPropertyRequest $request): JsonResponse
    {
        $validated = $request->validated();

        [$swLat, $swLng, $neLat, $neLng] = array_map('floatval', explode(',', $validated['bounds']));
        $minLat = min($swLat, $neLat);
        $maxLat = max($swLat, $neLat);
        $minLng = min($swLng, $neLng);
        $maxLng = max($swLng, $neLng);

        $query = Property::query()
            ->with('address', 'media')
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->whereHas('address', function ($q) use ($minLat, $maxLat, $minLng, $maxLng) {
                $q->whereNotNull('latitude')
                    ->whereNotNull('longitude')
                    ->whereBetween('latitude', [$minLat, $maxLat])
                    ->whereBetween('longitude', [$minLng, $maxLng]);
            });

        // Rayon autour d'un point, en KILOMETRES — memes noms, memes bornes et
        // meme unite que `/search` (ADR-0023). Il se CONJOINT au cadrage : les
        // deux clauses portent sur la meme sous-requete `address`, en ET.
        //
        // Un bien sans coordonnees est exclu, comme sur `/search` — c'est
        // `DistanceHaversine` qui porte la regle, et le clamp `LEAST/GREATEST`
        // sans lequel `acos()` LEVE sur PostgreSQL quand le point de recherche
        // coincide avec un bien.
        if (isset($validated['lat'], $validated['lng'], $validated['radius_km'])) {
            $lat = (float) $validated['lat'];
            $lng = (float) $validated['lng'];
            $rayon = (float) $validated['radius_km'];
            $query->whereHas(
                'address',
                fn ($q) => DistanceHaversine::restreindreAuRayonKm($q, $lat, $lng, $rayon)
            );
        }

        if (! empty($validated['type'])) {
            $types = array_filter(explode(',', $validated['type']));
            $query->whereIn('type', $types);
        }
        if (! empty($validated['contract_type'])) {
            $query->where('contract_type', $validated['contract_type']);
        }
        if (isset($validated['price_min'])) {
            $query->where('price', '>=', $validated['price_min']);
        }
        if (isset($validated['price_max'])) {
            $query->where('price', '<=', $validated['price_max']);
        }

        $properties = $query->limit(self::MAP_MAX_RESULTS + 1)->get();
        $truncated = $properties->count() > self::MAP_MAX_RESULTS;
        if ($truncated) {
            $properties = $properties->take(self::MAP_MAX_RESULTS);
        }

        $features = PropertyMapGeoJsonResource::collection($properties);

        return $this->json([
            'type' => 'FeatureCollection',
            'features' => $features->toArray($request),
            'meta' => [
                'limit' => self::MAP_MAX_RESULTS,
                'returned' => $properties->count(),
                'truncated' => $truncated,
            ],
        ]);
    }

    public function show(Request $request, string $slug): PropertyResource
    {
        $property = Property::query()
            ->with([
                'address',
                'media',
                'tags',
                'owner.media',
                'agency.media',
                // TCK-502 — `.media` en plus : la fiche nomme désormais le CONTACT PRINCIPAL,
                // qui peut être un collaborateur, et sa carte porte son avatar.
                'collaborators.user.media',
                // TCK-590 — l'éligibilité du contact principal se juge sur ses profils chargés.
                'collaborators.user.agentProfiles',
                'collaborators.user.agencyAdminProfiles',
                'documents.media',
                'priceHistory',
                'reviews' => fn ($q) => $q->where('is_approved', true),
            ])
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        // TCK-598 (contrainte 3, ADR-0052 §1) — la lecture n'écrit plus. Elle incrémentait
        // `views_count` par `$property->increment()`, donc rajeunissait `updated_at` et vidait le
        // cache des biens similaires de TOUS les biens à chaque vue ; elle ne pouvait pas non plus
        // entrer dans un cache, puisque son corps changeait à chaque appel. La vue se compte par
        // `view()` ci-dessous, appelée par le navigateur.
        return new PropertyResource($property);
    }

    /**
     * TCK-598 — compte une vue de la fiche. `POST /api/public/properties/{slug}/view` → 204.
     *
     * Ne rend JAMAIS d'erreur visible : un slug inconnu, ou un bien qui n'est pas public, rend
     * aussi 204, sans écriture — un compteur n'a rien à apprendre à son appelant, et surtout pas
     * l'existence d'un bien retiré. L'appel part du NAVIGATEUR, directement : l'API y voit l'IP du
     * visiteur par sa propre chaîne de mandataires, sans transit par le serveur Next.
     */
    public function view(Request $request, PropertyViewCounter $compteur, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->first();

        if ($property !== null) {
            $compteur->record($property, (string) $request->ip());
        }

        return $this->json(null, 204);
    }

    /**
     * TCK-598 (V10, contraintes 10 et 11) — ce qu'est devenu un bien dont la fiche rend 404.
     *
     * GET /api/public/properties/{slug}/status → `{ state, contract_type, type, location, similar }`.
     *
     * 404 — **le même que pour un slug inconnu**, même corps — pour un brouillon, un bien en
     * attente de modération ou refusé, privé, de test, jamais publié ou supprimé : l'existence d'un
     * bien non public ne fuit pas. Le prédicat est dans `EtatPublicDuBien`, qui COMPOSE
     * `scopePublic()` au lieu de le recopier.
     *
     * `similar` passe par `findSimilar()`, puis par `->public()` une seconde fois : la liste
     * d'identifiants y est mise en cache, et un bien retiré depuis y resterait jusqu'à expiration.
     */
    public function status(Request $request, EtatPublicDuBien $etats, SimilarPropertiesService $service, string $slug): JsonResponse
    {
        $etat = $etats->pour($slug);
        abort_if($etat === null, 404);

        $property = $etat['property'];
        $similaires = $service->findSimilar($property, EtatPublicDuBien::MAX_SIMILAIRES);
        $publics = Property::query()->public()->whereIn('id', $similaires->pluck('id'))->pluck('id')->flip();

        return $this->json([
            'data' => [
                'state' => $etat['state'],
                'contract_type' => $property->contract_type?->value,
                'type' => $property->type?->value,
                'location' => [
                    'city' => $property->address?->city,
                    'quarter' => $property->address?->neighborhood,
                ],
                'similar' => PropertyResource::collection(
                    $similaires->filter(fn (Property $p) => $publics->has($p->id))->values()
                )->resolve($request),
            ],
        ]);
    }

    public function similar(ListSimilarPropertiesRequest $request, SimilarPropertiesService $service, string $slug): AnonymousResourceCollection
    {
        $property = Property::query()
            ->public()
            ->where('slug', $slug)
            ->firstOrFail();

        $results = $service->findSimilar($property, $request->limit());

        return PropertyResource::collection($results);
    }

    public function reviews(Request $request, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $paginated = $property->reviews()
            ->where('is_approved', true)
            ->with('author.media')
            ->latest()
            ->paginate(self::parPage($request, 10, self::REVIEWS_MAX_PER_PAGE));

        $approved = $property->reviews()->where('is_approved', true);
        $avg = round((float) ($approved->avg('rating') ?? 0), 2);

        $raw = (clone $approved)
            ->selectRaw('rating, count(*) as cnt')
            ->groupBy('rating')
            ->pluck('cnt', 'rating')
            ->toArray();

        $distribution = [
            '5' => (int) ($raw[5] ?? 0),
            '4' => (int) ($raw[4] ?? 0),
            '3' => (int) ($raw[3] ?? 0),
            '2' => (int) ($raw[2] ?? 0),
            '1' => (int) ($raw[1] ?? 0),
        ];

        return $this->json([
            'data' => ReviewResource::collection($paginated)->toArray($request),
            'meta' => $this->paginationMeta($paginated, [
                'average' => $avg,
                'distribution' => $distribution,
            ]),
        ]);
    }

    public function report(ReportPublicPropertyRequest $request, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $data = $request->validated();

        PropertyReport::create([
            'property_id' => $property->id,
            'reporter_user_id' => $request->user()?->id,
            'reporter_ip' => $request->ip(),
            'reason' => $data['reason'],
            'details' => $data['details'] ?? null,
        ]);

        return $this->json(null, 204);
    }

    /**
     * Demande de visite depuis la fiche publique — avec ou sans compte.
     *
     * TCK-590 — elle faisait un `PropertyVisit::create` direct : **ni `agent_id`, ni
     * notification, ni quota**, alors que c'est le chemin que TOUS les clients empruntent. Elle
     * passe désormais par les mêmes garde-fous que le chemin authentifié :
     *
     *   · le quota de visites actives (`VisitSchedulingService::createOrFail`) ;
     *   · `agent_id` = le contact principal **s'il est personnel de l'agence du bien**, sinon la
     *     visite est « non attribuée » (contrainte 2) ;
     *   · `customer_id` = la fiche du visiteur DANS l'agence du bien, ou rien — `$user->customer`
     *     était un `hasOne` sans unicité, qui rattachait une fiche arbitraire, d'une autre agence ;
     *   · l'agence est prévenue (`VisitNotifier`), avec le repli vers ses admins ; sans
     *     destinataire ni agence, 409 avant toute écriture (contrainte 1) ;
     *   · le dépôt n'envoie AUCUN SMS au visiteur (contrainte 4).
     */
    public function visitRequest(VisitRequestPublicPropertyRequest $request, VisitSchedulingService $scheduling, VisitNotifier $notifier, ContactLeadService $leads, string $slug): JsonResponse
    {
        $property = $request->property()->loadMissing(PrimaryPropertyContact::eagerLoads());
        $user = $request->user();
        $data = $request->validated();

        if ($leads->recipientsFor($property)->isEmpty()) {
            $leads->refuseUnavailable();
        }

        $primary = PrimaryPropertyContact::for($property);
        $agentId = PersonnelDeLAgence::estPersonnel($primary, $property->agency_id) ? $primary->id : null;

        $customerId = ($user !== null && $property->agency_id !== null)
            ? Customer::query()->where('user_id', $user->id)->where('agency_id', $property->agency_id)->value('id')
            : null;

        $visit = $scheduling->createOrFail($property, $user, [
            'property_id' => $property->id,
            'visitor_id' => $user?->id,
            'customer_id' => $customerId,
            'agent_id' => $agentId,
            'scheduled_at' => $data['scheduled_at'],
            'type' => $data['type'] ?? VisitType::InPerson->value,
            'duration_minutes' => $data['duration_minutes'] ?? VisitSchedulingService::DEFAULT_DURATION_MINUTES,
            'status' => VisitStatus::Scheduled->value,
            'visitor_name' => $data['visitor_name'] ?? trim(($user?->first_name ?? '').' '.($user?->last_name ?? '')) ?: null,
            'visitor_email' => $data['visitor_email'] ?? $user?->email,
            'visitor_phone' => $data['visitor_phone'] ?? $user?->phone,
            'notes' => $data['notes'] ?? null,
            'source' => $data['source'] ?? null,
            'medium' => $data['medium'] ?? null,
            'locale' => app()->getLocale(),
        ]);

        $notifier->requested($visit->fresh(['property', 'agent']));

        return $this->json([
            'data' => PropertyVisitResource::make($visit)->toArray($request),
        ], 201);
    }

    /**
     * TCK-590 — les créneaux d'une journée, à Dakar : `{date, timezone, slots: [{start, label,
     * available}]}`. Rien sur les visites qui occupent un créneau.
     */
    public function visitSlots(VisitSlotsPublicPropertyRequest $request, VisitSchedulingService $scheduling, string $slug): JsonResponse
    {
        $property = $request->property()->loadMissing(PrimaryPropertyContact::eagerLoads());
        $date = CarbonImmutable::createFromFormat('Y-m-d', $request->validated('date'), VisitSchedulingService::TIMEZONE)->startOfDay();

        $primary = PrimaryPropertyContact::for($property);
        $agent = PersonnelDeLAgence::estPersonnel($primary, $property->agency_id) ? $primary : null;

        return $this->json([
            'data' => [
                'date' => $date->format('Y-m-d'),
                'timezone' => VisitSchedulingService::TIMEZONE,
                'slots' => $scheduling->availableSlots($property, $date, $agent),
            ],
        ]);
    }

    /**
     * TCK-180 — gate the "Laisser un avis" form on the property page.
     *
     * GET /api/public/properties/{slug}/review-eligibility →
     *   { eligible: bool, reason: 'visit'|'lease'|'none', already_reviewed: bool }
     *
     * Anonymous callers always get `eligible:false, reason:'none'`.
     */
    public function reviewEligibility(Request $request, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $user = $request->user();
        if ($user === null) {
            return $this->json([
                'data' => ['eligible' => false, 'reason' => 'none', 'already_reviewed' => false],
            ]);
        }

        $hasCompletedVisit = PropertyVisit::query()
            ->where('property_id', $property->id)
            ->where('status', VisitStatus::Completed)
            ->where(function ($q) use ($user): void {
                $q->where('visitor_id', $user->id)
                    ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
            })
            ->exists();

        $hasLease = Lease::query()
            ->where('property_id', $property->id)
            ->whereHas('tenant', fn ($c) => $c->where('user_id', $user->id))
            ->exists();

        $alreadyReviewed = Review::query()
            ->where('reviewable_type', Property::class)
            ->where('reviewable_id', $property->id)
            ->where('author_id', $user->id)
            ->exists();

        $reason = 'none';
        if ($hasLease) {
            $reason = 'lease';
        } elseif ($hasCompletedVisit) {
            $reason = 'visit';
        }

        return $this->json([
            'data' => [
                'eligible' => $reason !== 'none',
                'reason' => $reason,
                'already_reviewed' => $alreadyReviewed,
            ],
        ]);
    }

    public function bookingRequest(BookingRequestPublicPropertyRequest $request, CustomerService $customers, BookingQuote $quotes, PropertyAvailabilityService $availability, string $slug): JsonResponse
    {
        $property = $request->property();

        // TCK-176 — for a sale property the booking is actually a *purchase
        // offer*: collect `offer_amount` + `offer_expires_at` + `terms_accepted`
        // instead of dates/guests; for a rent property keep the original
        // booking-request payload. The rule set that follows from it lives in
        // BookingRequestPublicPropertyRequest (TCK-305).
        $isSale = $property->contract_type?->value === 'sale';

        $data = $request->validated();

        $user = $request->user();
        abort_if($user === null, 401);

        // Vérification adverse de TCK-535 — même règle que `BookingService::create()` : le
        // propriétaire ne réserve pas (et ne fait pas d'offre sur) son propre bien. Avant tout
        // calcul et toute écriture, pour ne pas lui créer de fiche client.
        abort_code_if(
            $property->user_id === $user->id && ! $user->isSuperAdmin(),
            403,
            'booking.own_property'
        );

        // TCK-535 — un séjour court (`daily`, `weekly`) suit la règle du tunnel (TCK-530) : total
        // et acompte de `BookingQuote`, calculés AVANT toute écriture. Toute autre location est la
        // CANDIDATURE du bouton « Postuler » (TCK-165, `getPrimaryCtaForProperty()` → `apply`),
        // qui poste ici : elle reste possible, au montant d'UN loyer — jamais prix × nuits — et
        // sans l'acompte qu'elle n'a jamais porté. Le prix `decimal:2` est recopié tel quel, sans
        // passer par un flottant.
        $amounts = match (true) {
            $isSale => null,
            in_array($property->rent_period, [RentPeriod::Daily, RentPeriod::Weekly], true) => $quotes->for(
                $property,
                Carbon::parse($data['start_date']),
                Carbon::parse($data['end_date']),
            ),
            default => ['total_amount' => (string) $property->price, 'deposit_amount' => null],
        };

        $customer = $customers->findOrCreateFromUser($user);

        if ($isSale) {
            $booking = Booking::create([
                'property_id' => $property->id,
                'customer_id' => $customer->id,
                'created_by_id' => $user->id,
                'agency_id' => $property->agency_id,
                'start_date' => null,
                'end_date' => null,
                'total_amount' => (float) $data['offer_amount'],
                'currency' => $property->currency,
                'status' => BookingStatus::Pending->value,
                'expires_at' => $data['offer_expires_at'],
                'notes' => $data['message'] ?? null,
                'metadata' => [
                    'kind' => 'offer',
                    'offer_amount' => (float) $data['offer_amount'],
                    'offer_expires_at' => $data['offer_expires_at'],
                    'list_price_at_offer' => (float) $property->price,
                ],
            ]);

            // TCK-596 — l'offre prévient qui doit la traiter : elle ne prévenait personne.
            BookingRequested::dispatch($booking, $user->id);

            return $this->json([
                'data' => BookingResource::make($booking)->toArray($request),
            ], 201);
        }

        // TCK-596 — un séjour daté sur des nuits déjà confirmées est refusé, sous le verrou de la
        // ligne du bien que `BookingService::confirm` prend aussi. L'offre d'achat n'a pas de nuits.
        $booking = DB::transaction(function () use ($availability, $property, $customer, $user, $data, $amounts): Booking {
            Property::query()->whereKey($property->getKey())->lockForUpdate()->first();
            $availability->assertAvailable($property, $data['start_date'], $data['end_date']);

            return Booking::create([
                'property_id' => $property->id,
                'customer_id' => $customer->id,
                'created_by_id' => $user->id,
                'agency_id' => $property->agency_id,
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                // TCK-535 — ce calcul-ci donnait `prix × nuits` au seul `daily`, et le prix SEUL à
                // toute autre période : dix nuits dans un bien hebdomadaire valaient une semaine.
                'total_amount' => $amounts['total_amount'],
                'deposit_amount' => $amounts['deposit_amount'],
                'currency' => $property->currency,
                'status' => BookingStatus::Pending->value,
                'notes' => $data['message'] ?? null,
                'metadata' => ['guests' => $data['guests']],
            ]);
        });

        // TCK-596 — la demande publique prévient qui doit la traiter : elle ne prévenait personne.
        BookingRequested::dispatch($booking, $user->id);

        return $this->json([
            'data' => BookingResource::make($booking)->toArray($request),
        ], 201);
    }

    /**
     * TCK-500 — RÉSOLUTION, en lecture seule : « ce bien, ai-je déjà un fil dessus ? »
     *
     * Le front s'en sert pour décider ce qu'il affiche au clic sur « Envoyer un message » : un
     * fil existant avec son historique et un champ vide, ou un fil qui n'existe pas encore avec
     * un brouillon pré-rempli. Il y prend aussi le titre et la référence du bien, ce qui lui
     * évite un second appel quand il arrive sur la messagerie pleine page depuis un mobile.
     *
     * ⚠️ Cet endpoint N'ÉCRIT RIEN, et c'est sa raison d'être. Créer le fil ici — la solution
     * qui vient en premier, parce qu'elle simplifie le front — déposerait une conversation vide
     * dans la boîte d'un agent à chaque visiteur qui ouvre le chat sans rien envoyer.
     * `PropertyConversationResolveTest::test_resolve_writes_nothing` compte les lignes des trois
     * tables autour de l'appel : c'est le seul test du fichier qu'un `firstOrCreate` ferait
     * rougir.
     */
    public function conversation(Request $request, PropertyConversationResolver $resolver, string $slug): JsonResponse
    {
        $property = $this->publicPropertyForContact($slug, $resolver);

        $user = $request->user();
        abort_if($user === null, 401);

        $recipient = $resolver->recipientFor($property);
        $canMessage = $recipient !== null && $recipient->id !== $user->id;

        return $this->json([
            'data' => [
                'conversation_id' => $canMessage
                    ? $resolver->findExisting($property, $user, $recipient)?->id
                    : null,
                'can_message' => $canMessage,
                'property' => [
                    'id' => $property->id,
                    'slug' => $property->slug,
                    'title' => $property->title,
                    'reference_number' => $property->reference_number,
                    // La vignette de l'en-tête du fil. `preview`, jamais l'original : ce chemin
                    // est public et l'original est la source non filigranée (TCK-106). Repli sur
                    // `thumbnail` tant que `preview` (en file) n'est pas produite, `null` plutôt
                    // qu'une URL en 404 (TCK-539).
                    'main_photo_url' => ($photo = $property->getFirstMedia('photos')) !== null
                        ? PublicPhotoUrl::upTo($photo, 'preview', fn () => $property->requiresWatermark())
                        : null,
                ],
                'recipient' => $recipient === null ? null : [
                    'id' => $recipient->id,
                    'name' => $this->displayName($recipient),
                    'avatar_url' => $recipient->getFirstMediaUrl('avatar') ?: null,
                ],
            ],
        ]);
    }

    public function contactMessage(ContactMessagePublicPropertyRequest $request, NotificationService $notifications, PropertyConversationResolver $resolver, string $slug): JsonResponse
    {
        $property = $this->publicPropertyForContact($slug, $resolver);

        $data = $request->validated();

        $user = $request->user();
        abort_if($user === null, 401);

        $primaryAgent = $resolver->recipientFor($property);

        abort_code_if($primaryAgent === null, 422, 'message.no_recipient');
        abort_code_if($primaryAgent->id === $user->id, 422, 'message.self');

        $conversation = $resolver->firstOrCreate($property, $user, $primaryAgent);

        $message = $conversation->messages()->create([
            'sender_id' => $user->id,
            'content' => $data['message'],
            'type' => MessageType::Text->value,
        ]);

        $conversation->update([
            'last_message_id' => $message->id,
            'last_message_preview' => mb_substr($data['message'], 0, 255),
            'last_message_at' => now(),
        ]);

        $notifications->send($primaryAgent, NotificationCode::MessageReceived, [
            'sender' => $this->displayName($user),
            'excerpt' => mb_strimwidth($data['message'], 0, 80, '…'),
        ], NotificationTarget::of('conversation', $conversation->id));

        return $this->json([
            'data' => [
                'conversation_id' => $conversation->id,
                // TCK-500 — `/messages/{id}` n'a JAMAIS existé côté front : la seule boîte de
                // réception est `/app/messages`, qui lit la conversation dans `?conversation=`.
                // Le front poussait donc l'utilisateur sur un 404 après chaque premier message.
                'redirect_to' => "/app/messages?conversation={$conversation->id}",
            ],
        ], 201);
    }

    /**
     * Le bien tel que les deux endpoints de contact le voient : public, jamais un brouillon, et
     * avec les relations dont {@see PropertyConversationResolver::recipientFor()} a besoin.
     */
    private function publicPropertyForContact(string $slug, PropertyConversationResolver $resolver): Property
    {
        return Property::query()
            ->with($resolver::eagerLoads())
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();
    }

    /** Le nom affiché d'un utilisateur, avec les mêmes replis que la notification d'origine. */
    private function displayName(User $user): string
    {
        return trim(($user->first_name ?? '').' '.($user->last_name ?? '')) ?: (string) ($user->username ?? $user->email);
    }

    /**
     * Anonymous lead capture endpoint (TCK-161). Lets a non-authenticated
     * visitor send a one-shot contact message to the property's primary
     * agent (or owner) without creating an account. A filled honeypot returns
     * 201 silently — bots get a normal-looking success without polluting the
     * database.
     *
     * TCK-590 — la piste, son destinataire, le repli vers les admins de l'agence, le 409 sans
     * destinataire ni agence et l'accusé de réception vivent dans `ContactLeadService`, partagé
     * avec le contact d'un agent.
     */
    public function contactLead(ContactLeadPublicRequest $request, ContactLeadService $leads, PropertyConversationResolver $resolver, string $slug): JsonResponse
    {
        $data = $request->validated();

        if (! empty($data['company'])) {
            return $this->json(['data' => ['accepted' => true]], 201);
        }

        $property = $this->publicPropertyForContact($slug, $resolver);

        $leads->forProperty($property, $data, $request);

        return $this->json(['data' => ['accepted' => true]], 201);
    }

    /**
     * TCK-590 — un clic WhatsApp / Appeler est compté : une piste de canal `whatsapp` / `call`,
     * sans identité, hors de la file « à traiter ». Limiteur dédié : un compteur n'a pas à
     * consommer le crédit des demandes de contact.
     */
    public function contactClick(ContactClickPublicRequest $request, ContactLeadService $leads, string $slug): JsonResponse
    {
        $property = $request->property()->loadMissing(PrimaryPropertyContact::eagerLoads());
        $data = $request->validated();

        $leads->recordClick(
            $property,
            ContactLeadChannel::from($data['channel']),
            $data['source'] ?? null,
            $data['medium'] ?? null,
            $request,
        );

        return $this->json(null, 204);
    }

    /**
     * Le numéro à composer depuis la fiche.
     *
     * TCK-502 — il rendait `owner->phone` pendant que le bouton « Envoyer un message », juste à
     * côté, écrivait au collaborateur `agent`. Deux boutons voisins, deux personnes. C'est la
     * contrainte 3 du ticket : le téléphone fait partie du lot.
     */
    public function contact(string $slug): JsonResponse
    {
        $property = Property::query()
            ->with(PrimaryPropertyContact::eagerLoads())
            ->public()
            ->where('slug', $slug)
            ->firstOrFail();

        // TCK-590 — le message prérempli (« Bonjour, je suis intéressé(e)… Vu sur Takussan.sn »)
        // était écrit ICI, en français quelle que soit la langue du visiteur : le front le
        // construit désormais (principe n°5). L'endpoint ne rend plus que ce que le front ne peut
        // pas savoir — le numéro, révélé au geste et sous limiteur (contrainte 7).
        return $this->json([
            'phone' => PrimaryPropertyContact::for($property)?->phone,
        ]);
    }
}
