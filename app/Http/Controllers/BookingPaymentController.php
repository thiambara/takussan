<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreBookingPaymentRequest;
use App\Http\Requests\UpdateBookingPaymentRequest;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Services\Model\BookingPaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Throwable;

class BookingPaymentController extends Controller
{

    public function __construct(private readonly BookingPaymentService $bookingPaymentService)
    {
        $this->middleware('permission:booking_payments.view')->only(['index', 'show']);
        $this->middleware('permission:booking_payments.create')->only(['create', 'store']);
        $this->middleware('permission:booking_payments.update')->only(['edit', 'update']);
        $this->middleware('permission:booking_payments.delete')->only(['destroy']);
    }

    /**
     * Display a listing of the payments.
     */
    public function index(): JsonResponse
    {
        $query = BookingPayment::allThroughRequest();

        // Show only user's payments if not admin
        if (!Auth::user()->hasPermission('booking_payments.view_all')) {
            $query->whereHas('booking', function ($q) {
                $q->where('user_id', Auth::id());
            });
        }

        return response()->json($query->paginatedThroughRequest());
    }

    /**
     * Store a newly created payment in storage.
     * @throws Throwable
     */
    public function store(StoreBookingPaymentRequest $request): JsonResponse
    {
        $bookingPayment = $this->bookingPaymentService->store($request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Payment created successfully',
            'data' => $bookingPayment->load(['booking', 'user'])
        ], 201);
    }

    /**
     * Display the specified payment.
     */
    public function show(BookingPayment $bookingPayment): JsonResponse
    {
        // Check if user can view this payment
        if (!Auth::user()->hasPermission('booking_payments.view_all')) {
            $booking = Booking::find($bookingPayment->booking_id);
            if (!$booking || $booking->user_id !== Auth::id()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Unauthorized'
                ], 403);
            }
        }

        $bookingPayment->load(['booking', 'user']);

        return response()->json([
            'status' => 'success',
            'data' => $bookingPayment
        ]);
    }

    /**
     * Update the specified payment in storage.
     * @throws Throwable
     */
    public function update(UpdateBookingPaymentRequest $request, BookingPayment $bookingPayment): JsonResponse
    {
        // Check if user can edit this payment
        if (!Auth::user()->hasPermission('booking_payments.update_all')) {
            $booking = Booking::find($bookingPayment->booking_id);
            if (!$booking || $booking->user_id !== Auth::id()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Unauthorized'
                ], 403);
            }
        }

        $bookingPayment = $this->bookingPaymentService->update($bookingPayment, $request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Payment updated successfully',
            'data' => $bookingPayment->load(['booking', 'user'])
        ]);
    }

    /**
     * Remove the specified payment from storage.
     * @throws Throwable
     */
    public function destroy(BookingPayment $bookingPayment): JsonResponse
    {
        // Check if user can delete this payment
        if (!Auth::user()->hasPermission('booking_payments.delete_all')) {
            $booking = Booking::find($bookingPayment->booking_id);
            if (!$booking || $booking->user_id !== Auth::id()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Unauthorized'
                ], 403);
            }
        }

        $this->bookingPaymentService->delete($bookingPayment);

        return response()->json([
            'status' => 'success',
            'message' => 'Payment deleted successfully'
        ]);
    }

    /**
     * Get payments for a specific booking.
     */
    public function getBookingPayments(Booking $booking): JsonResponse
    {
        // Check if user can view these payments
        if (!Auth::user()->hasPermission('booking_payments.view_all') && $booking->property->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $bookingPayments = $booking->booking_payments()->get();

        return response()->json([
            'status' => 'success',
            'data' => $bookingPayments
        ]);
    }
}
