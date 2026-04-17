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
        $agencyId = $user->agency_id;

        $propertyScope = function ($q) use ($user, $agencyId) {
            $q->where(function ($inner) use ($user, $agencyId) {
                $inner->where('user_id', $user->id);
                if ($agencyId) {
                    $inner->orWhere('agency_id', $agencyId);
                }
            });
        };
        $leaseScope = function ($q) use ($user, $agencyId) {
            $q->where(function ($inner) use ($user, $agencyId) {
                $inner->where('landlord_id', $user->id);
                if ($agencyId) {
                    $inner->orWhere('agency_id', $agencyId);
                }
            });
        };

        $propertiesCount = Property::query()->tap($propertyScope)->count();
        $activeLeases = Lease::query()
            ->tap($leaseScope)
            ->where('status', LeaseStatus::Active)
            ->count();
        $pendingBookings = Booking::whereHas('property', $propertyScope)
            ->where('status', BookingStatus::Pending)
            ->count();
        $openMaintenance = MaintenanceRequest::whereHas('property', $propertyScope)
            ->whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])
            ->count();
        $overduePayments = LeasePayment::whereHas('lease', $leaseScope)
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
