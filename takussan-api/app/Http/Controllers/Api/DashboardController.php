<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = fn ($q) => $q->where('user_id', $user->id);

        $propertiesCount = Property::where('user_id', $user->id)->count();
        $activeLeases = Lease::where('landlord_id', $user->id)
            ->where('status', LeaseStatus::Active)
            ->count();
        $pendingBookings = Booking::whereHas('property', $scope)
            ->where('status', BookingStatus::Pending)
            ->count();
        $openMaintenance = MaintenanceRequest::whereHas('property', $scope)
            ->whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])
            ->count();
        $overduePayments = LeasePayment::whereHas('lease', fn ($q) => $q->where('landlord_id', $user->id))
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->whereDate('due_date', '<', now())
            ->count();

        return $this->json([
            'data' => [
                'properties_count' => $propertiesCount,
                'active_leases' => $activeLeases,
                'pending_bookings' => $pendingBookings,
                'open_maintenance' => $openMaintenance,
                'overdue_payments' => $overduePayments,
            ],
        ]);
    }
}
