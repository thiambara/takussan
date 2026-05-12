<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Models\Enums\Currency;
use App\Models\Property;
use App\Services\Model\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BookingController extends Controller
{
    public function __construct(protected BookingService $bookings) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Booking::query()->with(['property.address', 'customer']);

        if (! $user->hasRole('super_admin')) {
            $base->where(function ($q) use ($user) {
                $q->where('created_by_id', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id))
                    ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        $paginator = Booking::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => BookingResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'property_id' => ['required', 'exists:properties,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'total_amount' => ['required', 'numeric', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'notes' => ['nullable', 'string'],
            'expires_at' => ['nullable', 'date'],
        ]);

        $property = Property::findOrFail($data['property_id']);
        $booking = $this->bookings->create($property, $request->user(), $data);

        return $this->json([
            'data' => BookingResource::make($booking->load(['property', 'customer']))->toArray($request),
        ], 201);
    }

    public function show(Request $request, Booking $booking): JsonResponse
    {
        $this->authorizeAccess($request, $booking);

        return $this->json([
            'data' => BookingResource::make($booking->load(['property.address', 'customer']))->toArray($request),
        ]);
    }

    public function confirm(Request $request, Booking $booking): JsonResponse
    {
        $this->authorizeManage($request, $booking);
        $booking = $this->bookings->confirm($booking);

        return $this->json([
            'data' => BookingResource::make($booking)->toArray($request),
        ]);
    }

    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        $this->authorizeAccess($request, $booking);

        $data = $request->validate([
            'reason' => ['nullable', 'string'],
        ]);

        $booking = $this->bookings->cancel($booking, $request->user(), $data['reason'] ?? null);

        return $this->json([
            'data' => BookingResource::make($booking)->toArray($request),
        ]);
    }

    public function reject(Request $request, Booking $booking): JsonResponse
    {
        $this->authorizeManage($request, $booking);

        $data = $request->validate([
            'reason' => ['nullable', 'string'],
        ]);

        $booking = $this->bookings->reject($booking, $data['reason'] ?? null);

        return $this->json([
            'data' => BookingResource::make($booking)->toArray($request),
        ]);
    }

    protected function authorizeAccess(Request $request, Booking $booking): void
    {
        $user = $request->user();
        $property = $booking->property;
        $ok = $user->hasRole('super_admin')
            || $booking->created_by_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $booking->agency_id)
            || ($booking->customer && $booking->customer->user_id === $user->id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, Booking $booking): void
    {
        $user = $request->user();
        $property = $booking->property;
        $ok = $user->hasRole('super_admin')
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $booking->agency_id);

        abort_unless($ok, 403);
    }
}
