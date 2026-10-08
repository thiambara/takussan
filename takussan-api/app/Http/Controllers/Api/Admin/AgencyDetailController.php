<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\AgencyDetailResource;
use App\Http\Resources\PropertyResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

class AgencyDetailController extends Controller
{
    public function show(Request $request, Agency $agency): JsonResponse
    {
        // TCK-600 (ADR-0047) — l'administrateur principal est une personne : un `viewer` lit
        // l'agence, pas ses membres.
        $agency->load(self::readsPeople($request) ? ['primaryAdmin', 'addresses'] : ['addresses']);

        return $this->json([
            'data' => (new AgencyDetailResource($agency))->resolve($request) + [
                'suspension' => $this->suspension($agency),
            ],
        ]);
    }

    /**
     * TCK-600 (ADR-0048) — une agence suspendue l'affiche avec son motif et sa date : ceux de la
     * dernière suspension journalisée. `null` hors suspension.
     *
     * @return array{reason: string|null, suspended_at: string|null}|null
     */
    private function suspension(Agency $agency): ?array
    {
        if ($agency->status !== AgencyStatus::Suspended) {
            return null;
        }

        $activite = Activity::query()
            ->where('subject_type', $agency->getMorphClass())
            ->where('subject_id', $agency->getKey())
            ->where('event', 'super_admin_agency_suspended')
            ->latest('id')
            ->first();

        return [
            'reason' => $activite?->properties['reason'] ?? null,
            'suspended_at' => $activite?->created_at?->toIso8601String(),
        ];
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
            ->with(['agencyAdminProfiles', 'agentProfiles', 'ownerProfiles', 'serviceProviderProfile', 'platformProfile'])
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
            'meta' => $this->paginationMeta($users),
        ]);
    }

    public function properties(Request $request, Agency $agency): JsonResponse
    {
        // TCK-600 (ADR-0047) — `include=owner` ou `collaborators` servirait des personnes à un
        // `viewer` : ces relations ne se chargent qu'avec la lecture des utilisateurs.
        if (! self::readsPeople($request)) {
            $includes = array_filter(
                explode(',', (string) $request->query('include', '')),
                fn (string $include): bool => ! in_array(strtok(trim($include), '.'), ['owner', 'collaborators'], true),
            );
            $request->query->set('include', implode(',', $includes));
        }

        $query = Property::buildQuery(
            Property::query()->where('agency_id', $agency->id),
            $request,
        )->with(['address', 'agency']);

        $properties = $query->paginate(min(max((int) $request->query('per_page', 15), 1), 100));

        return $this->paginated($properties, PropertyResource::collection($properties)->resolve($request));
    }

    private static function readsPeople(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof User && $user->hasPlatformAbility(PlatformAbility::UsersView);
    }
}
