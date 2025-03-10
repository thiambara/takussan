<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreBookingRequest;
use App\Http\Requests\UpdateBookingRequest;
use App\Models\Bases\Enums\UserRoles;
use App\Models\Booking;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

class BookingController extends Controller
{

    public function __construct()
    {
    }


    public function index(): JsonResponse
    {
//        $key = (new Booking)->cashBaseKey();
//        $responseData = cache()->tags([Booking::class])->remember($key, 60 * 60, fn() => Booking::allThroughRequest());
        $query = Booking::allThroughRequest();
        if (!($user = auth()->user())->hasRoles(UserRoles::CUSTOMER)) {
            $query->where(
                fn(Builder $query) => $query->where('user_id', $user->id)->orWhereRelation('propriety.project.user', $user)
            );
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
