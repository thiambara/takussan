<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\BookingResource;
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
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\PropertyVisit;
use App\Services\Model\CustomerService;
use App\Services\Model\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;

class PublicPropertyController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $properties = Property::query()
            ->with('address', 'media')
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->orderByDesc('featured')
            ->orderByDesc('published_at')
            ->paginate((int) $request->input('per_page', 20));

        return PropertyResource::collection($properties);
    }

    public function search(Request $request): array
    {
        $validated = $request->validate([
            'q' => 'nullable|string|max:200',
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
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = Property::query()
            ->with('address', 'media')
            ->public()
            ->whereNot('status', PropertyStatus::Draft);

        if (! empty($validated['q'])) {
            $query->where(function ($q) use ($validated) {
                $q->where('title', 'like', '%'.$validated['q'].'%')
                    ->orWhere('description', 'like', '%'.$validated['q'].'%');
            });
        }

        if (! empty($validated['location']) || ! empty($validated['city'])) {
            $query->whereHas('address', function ($q) use ($validated) {
                if (! empty($validated['location'])) {
                    $q->where('neighborhood', $validated['location']);
                }
                if (! empty($validated['city'])) {
                    $q->where('city', $validated['city']);
                }
            });
        }

        if (! empty($validated['price_min'])) {
            $query->where('price', '>=', $validated['price_min']);
        }
        if (! empty($validated['price_max'])) {
            $query->where('price', '<=', $validated['price_max']);
        }
        if (isset($validated['bedrooms'])) {
            $query->where('bedrooms', $validated['bedrooms']);
        }
        if (isset($validated['bathrooms'])) {
            $query->where('bathrooms', $validated['bathrooms']);
        }
        if (! empty($validated['type'])) {
            $types = array_filter(explode(',', $validated['type']));
            $query->whereIn('type', $types);
        }
        if (! empty($validated['contract_type'])) {
            $query->where('contract_type', $validated['contract_type']);
        }
        if (! empty($validated['rent_period'])) {
            $query->where('rent_period', $validated['rent_period']);
        }
        if (array_key_exists('furnished', $validated) && $validated['furnished'] !== null) {
            $query->where('furnished', $validated['furnished']);
        }
        if (! empty($validated['tags'])) {
            $tags = is_array($validated['tags']) ? $validated['tags'] : explode(',', $validated['tags']);
            $query->whereHas('tags', fn ($q) => $q->whereIn('tags.name', $tags));
        }
        if (! empty($validated['lat_min']) && ! empty($validated['lat_max'])
            && ! empty($validated['lng_min']) && ! empty($validated['lng_max'])) {
            $query->whereHas('address', function ($q) use ($validated) {
                $q->whereBetween('latitude', [$validated['lat_min'], $validated['lat_max']])
                    ->whereBetween('longitude', [$validated['lng_min'], $validated['lng_max']]);
            });
        }

        $facets = [
            'locations' => (clone $query)
                ->setEagerLoads([])
                ->join('addresses', function ($join) {
                    $join->on('addresses.addressable_id', '=', 'properties.id')
                        ->where('addresses.addressable_type', '=', Property::class);
                })
                ->selectRaw('addresses.neighborhood as label, count(*) as cnt')
                ->whereNotNull('addresses.neighborhood')
                ->groupBy('addresses.neighborhood')
                ->pluck('cnt', 'label')
                ->toArray(),
            'bedrooms' => (clone $query)
                ->setEagerLoads([])
                ->selectRaw('properties.bedrooms as bedrooms, count(*) as cnt')
                ->whereNotNull('properties.bedrooms')
                ->groupBy('properties.bedrooms')
                ->pluck('cnt', 'bedrooms')
                ->toArray(),
            'types' => (clone $query)
                ->setEagerLoads([])
                ->selectRaw('properties.type as type, count(*) as cnt')
                ->groupBy('properties.type')
                ->pluck('cnt', 'type')
                ->toArray(),
        ];

        $sort = $validated['sort'] ?? 'relevance';
        match ($sort) {
            'price_asc' => $query->orderBy('price'),
            'price_desc' => $query->orderByDesc('price'),
            'created_desc' => $query->orderByDesc('created_at'),
            default => $query->orderByDesc('featured')->orderByDesc('published_at'),
        };

        $paginated = $query->paginate((int) ($validated['per_page'] ?? 20), ['*'], 'page', $validated['page'] ?? 1);

        return [
            'data' => PropertyResource::collection($paginated)->resolve(),
            'facets' => $facets,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ];
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

    public function similar(string $slug): AnonymousResourceCollection
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->with('address')
            ->where('slug', $slug)
            ->firstOrFail();

        $priceMin = (float) $property->price * 0.7;
        $priceMax = (float) $property->price * 1.3;

        $baseQuery = fn () => Property::query()
            ->with('address', 'media')
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('id', '!=', $property->id)
            ->where('type', $property->type)
            ->whereBetween('price', [$priceMin, $priceMax])
            ->orderByDesc('featured')
            ->orderByDesc('published_at')
            ->limit(6);

        $city = $property->address?->city;
        $results = $city
            ? $baseQuery()->whereHas('address', fn ($a) => $a->where('city', $city))->get()
            : $baseQuery()->get();

        if ($results->count() < 3) {
            $results = $baseQuery()->get();
        }

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

    public function bookingRequest(Request $request, CustomerService $customers, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $data = $request->validate([
            'start_date' => ['required', 'date', 'after_or_equal:today'],
            'end_date' => ['required', 'date', 'after:start_date'],
            'guests' => ['required', 'integer', 'min:1', 'max:50'],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();
        abort_if($user === null, 401);

        $customer = $customers->findOrCreateFromUser($user);

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
