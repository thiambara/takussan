<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\ListSimilarPropertiesRequest;
use App\Http\Requests\Public\BookingRequestPublicPropertyRequest;
use App\Http\Requests\Public\ByIdsPublicPropertyRequest;
use App\Http\Requests\Public\ComparePublicPropertyRequest;
use App\Http\Requests\Public\ContactLeadPublicRequest;
use App\Http\Requests\Public\ContactMessagePublicPropertyRequest;
use App\Http\Requests\Public\HomepageDiscoveryRequest;
use App\Http\Requests\Public\MapPublicPropertyRequest;
use App\Http\Requests\Public\ReportPublicPropertyRequest;
use App\Http\Requests\Public\SearchPublicPropertyRequest;
use App\Http\Requests\Public\VisitRequestPublicPropertyRequest;
use App\Http\Resources\BookingResource;
use App\Http\Resources\PropertyMapGeoJsonResource;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\PropertySitemapResource;
use App\Http\Resources\PropertyVisitResource;
use App\Http\Resources\ReviewResource;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\NotificationType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyReport;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Services\Model\CustomerService;
use App\Services\Model\NotificationService;
use App\Services\Property\HomepageDiscoveryService;
use App\Services\Property\SimilarPropertiesService;
use App\Services\Search\PropertySearchService;
use App\Support\DistanceHaversine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
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
     * Plafond du nombre de villes rendues par `GET /public/properties/cities`.
     *
     * Ce n'est pas une pagination : la liste est un DOMAINE, et un domaine se rend entier ou pas
     * du tout. Le plafond est une garde contre une base polluée (une ville par annonce), pas une
     * fenêtre — au-delà, la réponse le DIT (`truncated: true`) pour que l'appelant sache qu'il ne
     * peut plus s'en servir comme domaine.
     */
    public const CITIES_MAX = 500;

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

        $properties = $query->paginate((int) $request->input('per_page', 20));

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
     * 2. **`per_page` est PLAFONNÉ, ici et pas ailleurs.** `index()` accepte n'importe quelle
     *    valeur (`paginate((int) $request->input('per_page', 20))`) ; sur une route anonyme qui
     *    énumère tout le catalogue, ce serait une invitation à demander le catalogue entier d'un
     *    coup. Le plafond est aussi un contrat avec le front, qui pagine dessus
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
            ->limit(self::CITIES_MAX + 1)
            ->pluck(DB::raw('count(*) as cnt'), 'addresses.city');

        $tronque = $lignes->count() > self::CITIES_MAX;

        $data = $lignes->take(self::CITIES_MAX)
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
            ->with(['address', 'media', 'tags'])
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
                'collaborators.user',
                'documents.media',
                'priceHistory',
                'reviews' => fn ($q) => $q->where('is_approved', true),
            ])
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $key = 'views:'.$property->id.':'.$request->ip();
        if (! RateLimiter::tooManyAttempts($key, 3)) {
            RateLimiter::hit($key, 3600);
            $property->increment('views_count');
        }

        return new PropertyResource($property);
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
            ->paginate((int) $request->input('per_page', 10));

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

    public function visitRequest(VisitRequestPublicPropertyRequest $request, string $slug): JsonResponse
    {
        $property = $request->property();
        $user = $request->user();
        $data = $request->validated();

        $visit = PropertyVisit::create([
            'property_id' => $property->id,
            'visitor_id' => $user?->id,
            'customer_id' => $user?->customer?->id,
            'scheduled_at' => $data['scheduled_at'],
            'type' => $data['type'] ?? VisitType::InPerson->value,
            'duration_minutes' => $data['duration_minutes'] ?? 30,
            'status' => VisitStatus::Scheduled->value,
            'visitor_name' => $data['visitor_name'] ?? trim(($user?->first_name ?? '').' '.($user?->last_name ?? '')) ?: null,
            'visitor_email' => $data['visitor_email'] ?? $user?->email,
            'visitor_phone' => $data['visitor_phone'] ?? $user?->phone,
            'notes' => $data['notes'] ?? null,
        ]);

        return $this->json([
            'data' => PropertyVisitResource::make($visit)->toArray($request),
        ], 201);
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

    public function bookingRequest(BookingRequestPublicPropertyRequest $request, CustomerService $customers, string $slug): JsonResponse
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

            return $this->json([
                'data' => BookingResource::make($booking)->toArray($request),
            ], 201);
        }

        $start = Carbon::parse($data['start_date']);
        $end = Carbon::parse($data['end_date']);
        $nights = max(1, (int) $start->diffInDays($end));
        $totalAmount = $property->rent_period === RentPeriod::Daily
            ? (float) $property->price * $nights
            : (float) $property->price;

        $booking = Booking::create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'created_by_id' => $user->id,
            'agency_id' => $property->agency_id,
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'total_amount' => $totalAmount,
            'currency' => $property->currency,
            'status' => BookingStatus::Pending->value,
            'notes' => $data['message'] ?? null,
            'metadata' => ['guests' => $data['guests']],
        ]);

        return $this->json([
            'data' => BookingResource::make($booking)->toArray($request),
        ], 201);
    }

    public function contactMessage(ContactMessagePublicPropertyRequest $request, NotificationService $notifications, string $slug): JsonResponse
    {
        $property = Property::query()
            ->with('owner', 'collaborators.user')
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $data = $request->validated();

        $user = $request->user();
        abort_if($user === null, 401);

        $primaryAgent = $property->collaborators
            ->firstWhere('role', CollaboratorRole::Agent)?->user
            ?? $property->owner;

        abort_if($primaryAgent === null, 422, 'No recipient available.');
        abort_if($primaryAgent->id === $user->id, 422, 'You cannot message yourself.');

        $conversation = DB::transaction(function () use ($user, $primaryAgent, $property) {
            $existing = Conversation::query()
                ->where('property_id', $property->id)
                ->whereHas('participants', fn ($q) => $q->where('user_id', $user->id))
                ->whereHas('participants', fn ($q) => $q->where('user_id', $primaryAgent->id))
                ->lockForUpdate()
                ->first();

            if ($existing) {
                return $existing;
            }

            $conv = Conversation::create([
                'type' => ConversationType::Direct->value,
                'status' => ConversationStatus::Active->value,
                'created_by' => $user->id,
                'property_id' => $property->id,
            ]);
            $conv->participants()->attach([
                $user->id => ['joined_at' => now()],
                $primaryAgent->id => ['joined_at' => now()],
            ]);

            return $conv;
        });

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

        $fullName = trim(($user->first_name ?? '').' '.($user->last_name ?? '')) ?: ($user->username ?? 'Utilisateur');
        $notifications->notify(
            $primaryAgent,
            NotificationType::Message,
            'Nouveau message',
            $fullName.': '.mb_strimwidth($data['message'], 0, 80, '…'),
            ['conversation_id' => $conversation->id, 'message_id' => $message->id],
        );

        return $this->json([
            'data' => [
                'conversation_id' => $conversation->id,
                'redirect_to' => "/messages/{$conversation->id}",
            ],
        ], 201);
    }

    /**
     * Anonymous lead capture endpoint (TCK-161). Lets a non-authenticated
     * visitor send a one-shot contact message to the property's primary
     * agent (or owner) without creating an account. Persists the lead for
     * moderation/anti-spam follow-up and pings the recipient via the
     * existing notification channel. A filled honeypot returns 201 silently
     * — bots get a normal-looking success without polluting the database.
     */
    public function contactLead(ContactLeadPublicRequest $request, NotificationService $notifications, string $slug): JsonResponse
    {
        $data = $request->validated();

        if (! empty($data['company'])) {
            return $this->json(['data' => ['accepted' => true]], 201);
        }

        $property = Property::query()
            ->with('owner', 'collaborators.user')
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $primaryAgent = $property->collaborators
            ->firstWhere('role', CollaboratorRole::Agent)?->user
            ?? $property->owner;

        $lead = PropertyContactLead::create([
            'property_id' => $property->id,
            'recipient_user_id' => $primaryAgent?->id,
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'message' => $data['message'],
            'ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);

        if ($primaryAgent !== null) {
            $notifications->notify(
                $primaryAgent,
                NotificationType::Message,
                'Nouveau lead anonyme',
                $data['name'].' ('.$data['email'].') : '.mb_strimwidth($data['message'], 0, 80, '…'),
                ['property_id' => $property->id, 'lead_id' => $lead->id],
            );
        }

        return $this->json(['data' => ['accepted' => true]], 201);
    }

    public function contact(string $slug): JsonResponse
    {
        $property = Property::query()
            ->with('owner', 'address')
            ->public()
            ->where('slug', $slug)
            ->firstOrFail();

        $address = $property->address;
        $location = $address
            ? trim(($address->neighborhood ? $address->neighborhood.', ' : '').$address->city)
            : '';

        $message = "Bonjour, je suis intéressé(e) par votre bien :\n"
            ."{$property->title}\n"
            .number_format((float) $property->price, 0, ',', ' ').' FCFA'
            .($location ? " - {$location}" : '')."\n"
            .'Vu sur Takussan.sn';

        return $this->json([
            'phone' => $property->owner?->phone,
            'message' => $message,
        ]);
    }
}
