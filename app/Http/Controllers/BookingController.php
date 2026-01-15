<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreBookingRequest;
use App\Http\Requests\UpdateBookingRequest;
use App\Models\Bases\Enums\UserRole;
use App\Models\Booking;
use App\Services\Model\BookingService;
use Illuminate\Http\JsonResponse;

class BookingController extends Controller
{
    public function __construct(private BookingService $bookingService)
    {
        $this->bookingService = $bookingService;
        $this->middleware('permission:bookings.view')->only(['index', 'show']);
        $this->middleware('permission:bookings.create')->only(['store']);
        $this->middleware('permission:bookings.edit')->only(['update']);
        $this->middleware('permission:bookings.delete')->only(['destroy']);
    }


    public function index(): JsonResponse
    {
        $query = Booking::allThroughRequest();
        if (!($user = auth()->user())->hasRole(UserRole::Admin->value)) {
            $query->whereRelation('property.user', $user);
        }

        return $this->json($query->paginatedThroughRequest());
    }


    public function store(StoreBookingRequest $request): JsonResponse
    {
        $data = $request->validationData();
        $booking = $this->bookingService->store($data);
        return $this->json($booking);
    }


    public function show(Booking $booking): JsonResponse
    {
        return $this->json($booking);
    }


    public function update(UpdateBookingRequest $request, Booking $booking): JsonResponse
    {
        $booking = $this->bookingService->update($booking, $request->validated());
        return $this->json($booking);
    }


    public function destroy(Booking $booking): JsonResponse
    {
        $this->bookingService->delete($booking);
        return $this->json($booking);
    }
}
