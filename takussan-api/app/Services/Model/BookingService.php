<?php

namespace App\Services\Model;

use App\Models\Booking;
use Illuminate\Support\Facades\DB;
use Throwable;

class BookingService
{
    /**
     * Store a new booking
     * @throws Throwable
     */
    public function store(array $data): Booking
    {
        return DB::transaction(function () use ($data) {
            return Booking::create($data);
        });
    }

    /**
     * Update an existing booking
     * @throws Throwable
     */
    public function update(Booking $booking, array $data): Booking
    {
        return DB::transaction(function () use ($booking, $data) {
            $booking->update($data);
            return $booking;
        });
    }

    /**
     * Delete a booking
     * @throws Throwable
     */
    public function delete(Booking $booking): bool
    {
        return DB::transaction(function () use ($booking) {
            return $booking->delete();
        });
    }
}
