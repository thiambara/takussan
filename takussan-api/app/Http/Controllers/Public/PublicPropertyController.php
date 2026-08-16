<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\ListSimilarPropertiesRequest;
use App\Http\Requests\Public\HomepageDiscoveryRequest;
use App\Http\Resources\BookingResource;
use App\Http\Resources\PropertyMapGeoJsonResource;
use App\Http\Resources\PropertyResource;
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
            'meta' => ['per_row' => $request->perRow()],
        ], 200, [
            // Safe to share: the list shape of PropertyResource pins its labels
            // to `fr` and reads nothing off `$request->user()`. Keep it that way
            // — see the warning in HomepageDiscoveryService::baseQuery().
            'Cache-Control' => 'public, max-age=60, s-maxage=300',
        ]);
    }

    public function search(Request $request, PropertySearchService $service): array
    {
        $validated = $request->validate([
            'q' => 'nullable|string|max:200',
            'search' => 'nullable|string|max:200',
            'location' => 'nullable|string|max:100',
            'city' => 'nullable|string|max:100',
            'price_min' => 'nullable|numeric|min:0',
            'price_max' => 'nullable|numeric|min:0',
            'bedrooms' => 'nullable|integer|min:0|max:50',
            'bathrooms' => 'nullable|integer|min:0|max:50',
            'type' => 'nullable|string|max:500',
            'contract_type' => 'nullable|in:sale,rent',
            'rent_period' => 'nullable|string',
            'furnished' => 'nullable|boolean',
            'tags' => 'nullable|string',
            'lat_min' => 'nullable|numeric',
            'lat_max' => 'nullable|numeric',
            'lng_min' => 'nullable|numeric',
            'lng_max' => 'nullable|numeric',
            'sort' => 'nullable|in:relevance,price_asc,price_desc,created_desc',
            'floor_number' => 'nullable|integer|min:0|max:200',
            'available_from' => 'nullable|date|after_or_equal:today',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

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
    public function compare(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'string', 'max:200'],
        ]);

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
    public function byIds(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'string', 'max:300'],
        ]);

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

    public function map(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'bounds' => [
                'required',
                'string',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $parts = explode(',', (string) $value);
                    if (count($parts) !== 4) {
                        $fail(__('validation.bounds_format'));

                        return;
                    }
                    foreach ($parts as $p) {
                        if (! is_numeric(trim($p))) {
                            $fail(__('validation.bounds_format'));

                            return;
                        }
                    }
                    [$swLat, $swLng, $neLat, $neLng] = array_map('floatval', $parts);
                    if ($swLat < -90 || $swLat > 90 || $neLat < -90 || $neLat > 90
                        || $swLng < -180 || $swLng > 180 || $neLng < -180 || $neLng > 180) {
                        $fail(__('validation.bounds_format'));
                    }
                },
            ],
            'type' => ['nullable', 'string', 'max:100'],
            'contract_type' => ['nullable', 'in:sale,rent'],
            'price_min' => ['nullable', 'numeric', 'min:0'],
            'price_max' => ['nullable', 'numeric', 'min:0'],
        ]);

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
            'meta' => [
                'total' => $paginated->total(),
                'current_page' => $paginated->currentPage(),
                'per_page' => $paginated->perPage(),
                'last_page' => $paginated->lastPage(),
                'average' => $avg,
                'distribution' => $distribution,
            ],
        ]);
    }

    public function report(Request $request, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $data = $request->validate([
            'reason' => ['required', Rule::in(['spam', 'misleading', 'fraud', 'inappropriate_content', 'other'])],
            'details' => ['nullable', 'string', 'max:1000'],
        ]);

        PropertyReport::create([
            'property_id' => $property->id,
            'reporter_user_id' => $request->user()?->id,
            'reporter_ip' => $request->ip(),
            'reason' => $data['reason'],
            'details' => $data['details'] ?? null,
        ]);

        return $this->json(null, 204);
    }

    public function visitRequest(Request $request, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $user = $request->user();

        $rules = [
            'scheduled_at' => ['required', 'date', 'after:now'],
            'type' => ['nullable', Rule::enum(VisitType::class)],
            'duration_minutes' => ['nullable', 'integer', 'min:15', 'max:240'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
        if (! $user) {
            $rules['visitor_name'] = ['required', 'string', 'max:120'];
            $rules['visitor_email'] = ['required', 'email'];
            $rules['visitor_phone'] = ['required', 'string', 'max:30'];
        } else {
            $rules['visitor_name'] = ['nullable', 'string', 'max:120'];
            $rules['visitor_email'] = ['nullable', 'email'];
            $rules['visitor_phone'] = ['nullable', 'string', 'max:30'];
        }

        $data = $request->validate($rules);

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

    public function bookingRequest(Request $request, CustomerService $customers, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        // TCK-176 — for a sale property the booking is actually a *purchase
        // offer*: collect `offer_amount` + `offer_expires_at` + `terms_accepted`
        // instead of dates/guests; for a rent property keep the original
        // booking-request payload.
        $isSale = $property->contract_type?->value === 'sale';

        $rules = $isSale
            ? [
                'offer_amount' => ['required', 'numeric', 'min:1'],
                'offer_expires_at' => ['required', 'date', 'after:today'],
                'terms_accepted' => ['required', 'accepted'],
                'message' => ['nullable', 'string', 'max:1000'],
            ]
            : [
                'start_date' => ['required', 'date', 'after_or_equal:today'],
                'end_date' => ['required', 'date', 'after:start_date'],
                'guests' => ['required', 'integer', 'min:1', 'max:50'],
                'message' => ['nullable', 'string', 'max:1000'],
            ];

        $data = $request->validate($rules);

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

    public function contactMessage(Request $request, NotificationService $notifications, string $slug): JsonResponse
    {
        $property = Property::query()
            ->with('owner', 'collaborators.user')
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $data = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
        ]);

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
    public function contactLead(Request $request, NotificationService $notifications, string $slug): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:180'],
            'phone' => ['nullable', 'string', 'max:32'],
            'message' => ['required', 'string', 'min:5', 'max:2000'],
            'company' => ['nullable', 'string', 'max:120'], // honeypot
        ]);

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
