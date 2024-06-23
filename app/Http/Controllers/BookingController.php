<?php

namespace App\Http\Controllers;

use App\Http\Controllers\base\Controller;
use App\Http\Requests\StoreBookingRequest;
use App\Http\Requests\UpdateBookingRequest;
use App\Models\Booking;
use Illuminate\Http\JsonResponse;

class BookingController extends Controller
{

    public function __construct()
    {
        $this->authorizeResource(Booking::class, 'booking');
    }


    public function index(): JsonResponse
    {
        $key = (new Booking)->cashBaseKey();
        $responseData = cache()->tags([Booking::class])->remember($key, 60 * 60, fn() => Booking::allThroughRequest());
        return $this->json($responseData);
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
