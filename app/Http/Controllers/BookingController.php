<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreBookingRequest;
use App\Http\Requests\UpdateBookingRequest;
use App\Models\Bases\Enums\UserRole;
use App\Models\Booking;
use Illuminate\Http\JsonResponse;

class BookingController extends Controller
{

    public function __construct()
    {
    }


    public function index(): JsonResponse
    {
        $query = Booking::allThroughRequest();
        if (!($user = auth()->user())->hasRoles(UserRole::Customer->value)) {
            $query->whereRelation('propriety.user', $user);
        }

        return $this->json($query->paginatedThroughRequest());
    }


    public function store(StoreBookingRequest $request): JsonResponse
    {
        $data = $request->validationData();
        $booking = Booking::create($data);
        return $this->json($booking);
    }


    public function show(Booking $booking): JsonResponse
    {
        return $this->json($booking);
    }


    public function update(UpdateBookingRequest $request, Booking $booking): JsonResponse
    {
        $booking->update($request->validationData());
        return $this->json($booking);
    }


    public function destroy(Booking $booking): JsonResponse
    {
        $booking->delete();
        return $this->json($booking);
    }
}
