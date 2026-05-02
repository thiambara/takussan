<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * TCK-144 — Cross-tenant KPIs for the super-admin dashboard. Single endpoint
 * (no fan-out) returning the four blocks the platform console needs:
 * agencies, users, properties and revenue.
 */
class SystemMetricsController extends Controller
{
    public function index(): JsonResponse
    {
        $totalAgencies = Agency::query()->count();
        $verifiedAgencies = Agency::query()->where('is_verified', true)->count();
        $activeAgencies = Agency::query()->where('status', AgencyStatus::Active)->count();
        $suspendedAgencies = Agency::query()->where('status', AgencyStatus::Suspended)->count();

        $totalUsers = User::query()->count();
        $activeUsers = User::query()->where('status', UserStatus::Active)->count();

        $publishedProperties = Property::query()->where('status', PropertyStatus::Published)->count();
        $pendingProperties = Property::query()->where('status', PropertyStatus::PendingReview)->count();

        $activeLeases = Lease::query()->where('status', LeaseStatus::Active)->count();

        $platformRevenue = (float) LeasePayment::query()
            ->where('status', PaymentStatus::Paid)
            ->sum('amount');

        return $this->json([
            'data' => [
                'agencies' => [
                    'total' => $totalAgencies,
                    'verified' => $verifiedAgencies,
                    'active' => $activeAgencies,
                    'suspended' => $suspendedAgencies,
                    'verification_rate' => $totalAgencies > 0
                        ? round($verifiedAgencies / $totalAgencies, 4)
                        : 0.0,
                ],
                'users' => [
                    'total' => $totalUsers,
                    'active' => $activeUsers,
                ],
                'properties' => [
                    'published' => $publishedProperties,
                    'pending_review' => $pendingProperties,
                ],
                'leases' => [
                    'active' => $activeLeases,
                ],
                'revenue' => [
                    'platform_total_paid' => $platformRevenue,
                    'currency' => 'XOF',
                ],
                'generated_at' => now()->toIso8601String(),
            ],
        ]);
    }
}
