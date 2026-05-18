<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\AgencyDetailResource;
use App\Http\Resources\PropertyResource;
use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AgencyDetailController extends Controller
{
    public function show(Request $request, Agency $agency): JsonResponse
    {
        $agency->load(['primaryAdmin', 'addresses']);

        return $this->json([
            'data' => (new AgencyDetailResource($agency))->resolve($request),
        ]);
    }

    public function health(Agency $agency): JsonResponse
    {
        $since = now()->subDays(30)->toDateTimeString();
        $bindings = [
            $agency->id,
            PropertyStatus::Available->value,
            PropertyStatus::Published->value,
            $agency->id,
            PropertyStatus::PendingReview->value,
            $agency->id,
            PaymentStatus::Paid->value,
            $since,
            $agency->id,
            PaymentStatus::Paid->value,
            $since,
            $agency->id,
            PaymentStatus::Paid->value,
            $since,
            $agency->id,
            PaymentStatus::Paid->value,
            $since,
            $agency->id,
            PaymentStatus::Paid->value,
            $agency->id,
            PaymentStatus::Paid->value,
            $agency->id,
        ];

        $row = DB::selectOne(
            <<<'SQL'
            SELECT
                (SELECT COUNT(*) FROM properties WHERE agency_id = ? AND status IN (?, ?)) AS active_properties,
                (SELECT COUNT(*) FROM properties WHERE agency_id = ? AND status = ?) AS properties_in_moderation,
                (
                    SELECT COUNT(*) FROM (
                        SELECT bp.id
                        FROM booking_payments bp
                        INNER JOIN bookings b ON b.id = bp.booking_id
                        INNER JOIN properties p ON p.id = b.property_id
                        WHERE p.agency_id = ? AND bp.status = ? AND bp.paid_at >= ?
                        UNION ALL
                        SELECT lp.id
                        FROM lease_payments lp
                        INNER JOIN leases l ON l.id = lp.lease_id
                        WHERE l.agency_id = ? AND lp.status = ? AND lp.paid_at >= ?
                    ) recent_transactions
                ) AS transactions_30d,
                (
                    SELECT COALESCE(SUM(amount), 0) FROM (
                        SELECT bp.amount
                        FROM booking_payments bp
                        INNER JOIN bookings b ON b.id = bp.booking_id
                        INNER JOIN properties p ON p.id = b.property_id
                        WHERE p.agency_id = ? AND bp.status = ? AND bp.paid_at >= ?
                        UNION ALL
                        SELECT lp.amount
                        FROM lease_payments lp
                        INNER JOIN leases l ON l.id = lp.lease_id
                        WHERE l.agency_id = ? AND lp.status = ? AND lp.paid_at >= ?
                    ) recent_revenue
                ) AS revenue_30d,
                (
                    SELECT MAX(paid_at) FROM (
                        SELECT bp.paid_at
                        FROM booking_payments bp
                        INNER JOIN bookings b ON b.id = bp.booking_id
                        INNER JOIN properties p ON p.id = b.property_id
                        WHERE p.agency_id = ? AND bp.status = ?
                        UNION ALL
                        SELECT lp.paid_at
                        FROM lease_payments lp
                        INNER JOIN leases l ON l.id = lp.lease_id
                        WHERE l.agency_id = ? AND lp.status = ?
                    ) platform_payments
                ) AS last_platform_payment_at,
                (
                    SELECT COUNT(*)
                    FROM property_reports pr
                    INNER JOIN properties p ON p.id = pr.property_id
                    WHERE p.agency_id = ? AND pr.resolved_at IS NULL
                ) AS open_complaints
            SQL,
            $bindings,
        );

        return $this->json([
            'data' => [
                'active_properties' => (int) ($row->active_properties ?? 0),
                'properties_in_moderation' => (int) ($row->properties_in_moderation ?? 0),
                'transactions_30d' => (int) ($row->transactions_30d ?? 0),
                'revenue_30d' => (float) ($row->revenue_30d ?? 0),
                'last_platform_payment_at' => $row->last_platform_payment_at,
                'open_complaints' => (int) ($row->open_complaints ?? 0),
            ],
        ]);
    }

    public function team(Request $request, Agency $agency): JsonResponse
    {
        $base = User::query()
            ->whereHas('agentProfiles', fn ($q) => $q->where('agency_id', $agency->id))
            ->orWhereHas('ownerProfiles', fn ($q) => $q->where('agency_id', $agency->id))
            ->orderBy('first_name')
            ->orderBy('last_name');

        $users = User::buildQuery($base, $request)
            ->with(['agencyAdminProfiles', 'agentProfiles', 'ownerProfiles', 'brokerProfile', 'serviceProviderProfile', 'platformProfile'])
            ->paginate(min(max((int) $request->query('per_page', 15), 1), 100));

        return $this->json([
            'data' => $users->getCollection()->map(fn (User $user) => [
                'id' => $user->id,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'full_name' => $user->full_name,
                'email' => $user->email,
                'status' => $user->status?->value,
                'roles' => $user->profileTypes()->all(),
                'last_login_at' => $user->last_login_at?->toIso8601String(),
            ])->values()->all(),
            'meta' => [
                'total' => $users->total(),
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
            ],
        ]);
    }

    public function properties(Request $request, Agency $agency): JsonResponse
    {
        $query = Property::buildQuery(
            Property::query()->where('agency_id', $agency->id),
            $request,
        )->with(['address', 'agency']);

        $properties = $query->paginate(min(max((int) $request->query('per_page', 15), 1), 100));

        return $this->json([
            'data' => PropertyResource::collection($properties)->resolve($request),
            'meta' => [
                'total' => $properties->total(),
                'current_page' => $properties->currentPage(),
                'last_page' => $properties->lastPage(),
                'per_page' => $properties->perPage(),
            ],
        ]);
    }
}
