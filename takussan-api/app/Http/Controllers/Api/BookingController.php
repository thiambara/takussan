<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\CancelBookingRequest;
use App\Http\Requests\Api\RejectBookingRequest;
use App\Http\Requests\Api\StoreBookingRequest;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Models\Property;
use App\Services\Model\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function __construct(protected BookingService $bookings) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Booking::query()->with(['property.address', 'customer', 'agency']);

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('created_by_id', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id))
                    ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
                // TCK-587 — le périmètre d'agence est celui du PERSONNEL (ADR-0031) : un bailleur de l'agence
                // listait les ressources de tous les autres.
                if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                    $q->orWhere('agency_id', $staffAgencyId);
                }
            });
        }

        $paginator = Booking::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, BookingResource::collection($paginator)->toArray($request));
    }

    public function store(StoreBookingRequest $request): JsonResponse
    {
        $data = $request->validated();

        $property = Property::findOrFail($data['property_id']);
        $booking = $this->bookings->create($property, $request->user(), $data);

        return $this->json([
            'data' => BookingResource::make($booking->load(['property', 'customer', 'agency']))->toArray($request),
        ], 201);
    }

    public function show(Request $request, Booking $booking): JsonResponse
    {
        $this->authorize('view', $booking);

        return $this->json([
            'data' => BookingResource::make($booking->load(['property.address', 'customer', 'agency']))->toArray($request),
        ]);
    }

    public function confirm(Request $request, Booking $booking): JsonResponse
    {
        // TCK-587 — `validate` : `bookings.validate` pour le personnel (`BookingPolicy`).
        $this->authorize('validate', $booking);
        $booking = $this->bookings->confirm($booking);

        return $this->json([
            'data' => BookingResource::make($booking)->toArray($request),
        ]);
    }

    public function cancel(CancelBookingRequest $request, Booking $booking): JsonResponse
    {

        $data = $request->validated();

        $booking = $this->bookings->cancel($booking, $request->user(), $data['reason'] ?? null);

        return $this->json([
            'data' => BookingResource::make($booking)->toArray($request),
        ]);
    }

    public function reject(RejectBookingRequest $request, Booking $booking): JsonResponse
    {

        $data = $request->validated();

        $booking = $this->bookings->reject($booking, $data['reason'] ?? null);

        return $this->json([
            'data' => BookingResource::make($booking)->toArray($request),
        ]);
    }
}
