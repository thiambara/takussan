<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BookingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Booking::query()->with(['property.address', 'customer']);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('created_by_id', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $paginator = $query->latest()->paginate((int) $request->input('per_page', 20));

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
            'currency' => ['nullable', 'string', 'size:3'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'notes' => ['nullable', 'string'],
            'expires_at' => ['nullable', 'date'],
        ]);

        $property = Property::findOrFail($data['property_id']);

        $booking = Booking::create(array_merge($data, [
            'reference_number' => 'BK-'.strtoupper(Str::random(8)),
            'created_by_id' => $request->user()->id,
            'agency_id' => $property->agency_id,
            'status' => BookingStatus::Pending->value,
            'currency' => $data['currency'] ?? 'XOF',
            'expires_at' => $data['expires_at'] ?? now()->addDays(7),
        ]));

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
        abort_unless($booking->status === BookingStatus::Pending, 422, 'Only pending bookings can be confirmed.');

        $booking->update([
            'status' => BookingStatus::Confirmed,
            'confirmed_at' => now(),
        ]);

        return $this->json([
            'data' => BookingResource::make($booking->refresh())->toArray($request),
        ]);
    }

    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        $this->authorizeAccess($request, $booking);
        abort_if(
            in_array($booking->status, [BookingStatus::Cancelled, BookingStatus::Completed, BookingStatus::Expired], true),
            422,
            'Booking cannot be cancelled in its current state.'
        );

        $data = $request->validate([
            'reason' => ['nullable', 'string'],
        ]);

        $user = $request->user();
        $by = $user->id === $booking->customer?->user_id ? CancellationBy::Customer : CancellationBy::Owner;

        $booking->update([
            'status' => BookingStatus::Cancelled,
            'cancelled_at' => now(),
            'cancellation_by' => $by,
            'cancellation_reason' => $data['reason'] ?? null,
        ]);

        return $this->json([
            'data' => BookingResource::make($booking->refresh())->toArray($request),
        ]);
    }

    protected function authorizeAccess(Request $request, Booking $booking): void
    {
        $user = $request->user();
        $property = $booking->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
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
        $ok = $user->hasRole(['admin', 'super_admin'])
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $booking->agency_id);

        abort_unless($ok, 403);
    }
}
