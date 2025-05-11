<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreBookingPaymentRequest;
use App\Http\Requests\UpdateBookingPaymentRequest;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Services\Model\BookingPaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BookingPaymentController extends Controller
{
    protected BookingPaymentService $paymentService;

    public function __construct(BookingPaymentService $paymentService)
    {
        $this->paymentService = $paymentService;
        $this->middleware('permission:payments.view')->only(['index', 'show']);
        $this->middleware('permission:payments.create')->only(['create', 'store']);
        $this->middleware('permission:payments.update')->only(['edit', 'update']);
        $this->middleware('permission:payments.delete')->only(['destroy']);
    }

    /**
     * Display a listing of the payments.
     */
    public function index(Request $request): JsonResponse
    {
        $query = BookingPayment::query();

        // Apply filters
        if ($request->has('booking_id')) {
            $query->where('booking_id', $request->booking_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('payment_type')) {
            $query->where('payment_type', $request->payment_type);
        }

        if ($request->has('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        if ($request->has('date_from')) {
            $query->where('payment_date', '>=', $request->date_from);
        }

        if ($request->has('date_to')) {
            $query->where('payment_date', '<=', $request->date_to);
        }

        // Show only user's payments if not admin
        if (!Auth::user()->hasPermission('payments.view_all')) {
            $query->whereHas('booking', function ($q) {
                $q->where('user_id', Auth::id());
            });
        }

        // Load relationships
        $query->with(['booking', 'user']);

        // Sort by payment date by default, newest first
        $query->orderBy($request->get('sort_by', 'payment_date'), $request->get('sort_direction', 'desc'));

        // Paginate results
        $payments = $query->paginate($request->per_page ?? 15);

        return response()->json([
            'status' => 'success',
            'data' => $payments
        ]);
    }

    /**
     * Store a newly created payment in storage.
     */
    public function store(StoreBookingPaymentRequest $request): JsonResponse
    {
        $payment = $this->paymentService->store($request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Payment created successfully',
            'data' => $payment->load(['booking', 'user'])
        ], 201);
    }

    /**
     * Display the specified payment.
     */
    public function show(BookingPayment $payment): JsonResponse
    {
        // Check if user can view this payment
        if (!Auth::user()->hasPermission('payments.view_all')) {
            $booking = Booking::find($payment->booking_id);
            if (!$booking || $booking->user_id !== Auth::id()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Unauthorized'
                ], 403);
            }
        }

        $payment->load(['booking', 'user']);

        return response()->json([
            'status' => 'success',
            'data' => $payment
        ]);
    }

    /**
     * Update the specified payment in storage.
     */
    public function update(UpdateBookingPaymentRequest $request, BookingPayment $payment): JsonResponse
    {
        // Check if user can edit this payment
        if (!Auth::user()->hasPermission('payments.update_all')) {
            $booking = Booking::find($payment->booking_id);
            if (!$booking || $booking->user_id !== Auth::id()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Unauthorized'
                ], 403);
            }
        }

        $payment = $this->paymentService->update($payment, $request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Payment updated successfully',
            'data' => $payment->load(['booking', 'user'])
        ]);
    }

    /**
     * Remove the specified payment from storage.
     */
    public function destroy(BookingPayment $payment): JsonResponse
    {
        // Check if user can delete this payment
        if (!Auth::user()->hasPermission('payments.delete_all')) {
            $booking = Booking::find($payment->booking_id);
            if (!$booking || $booking->user_id !== Auth::id()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Unauthorized'
                ], 403);
            }
        }

        $this->paymentService->delete($payment);

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
        if (!Auth::user()->hasPermission('payments.view_all') && $booking->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $payments = $this->paymentService->getPaymentsForBooking($booking->id);

        return response()->json([
            'status' => 'success',
            'data' => $payments
        ]);
    }
}
