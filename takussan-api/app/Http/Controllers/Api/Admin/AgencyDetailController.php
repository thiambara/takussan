<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\AgencyDetailResource;
use App\Http\Resources\PropertyResource;
use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\PropertyStatus;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
            'suspended_at' => $this->instant($activite?->created_at),
        ];
    }

    /**
     * P198.02 (TCK-2032) — le revenu et les transactions des 30 derniers jours sont l'*Encaissé*
     * d'ADR-0057 § 2, lu par {@see CollectedPayments} : ni dépôt de garantie ni restitution, les
     * réservations nettes de remboursement. Ils étaient un `DB::selectOne` brut qui sommait toute
     * ligne payée, restitution comprise et en positif. Les lectures passent par Eloquent, et
     * écartent donc les lignes supprimées en douceur ; les jointures le posent elles-mêmes.
     */
    public function health(Agency $agency): JsonResponse
    {
        $since = now()->subDays(30);
        $agencyId = (int) $agency->id;

        $properties = Property::query()->where('agency_id', $agencyId);

        $leaseNet = CollectedPayments::LEASE_NET_SQL;
        $leases = CollectedPayments::leaseIncome($this->leasePaymentsOf($agencyId))
            ->where('lease_payments.paid_at', '>=', $since)
            ->toBase()
            ->selectRaw("COUNT(*) AS n, COALESCE(SUM({$leaseNet}), 0) AS total")
            ->first();

        $bookingNet = CollectedPayments::BOOKING_NET_SQL;
        $bookings = CollectedPayments::bookingIncome($this->bookingPaymentsOf($agencyId))
            ->where('booking_payments.paid_at', '>=', $since)
            ->toBase()
            ->selectRaw("COUNT(*) AS n, COALESCE(SUM({$bookingNet}), 0) AS total")
            ->first();

        // Le dernier paiement reste « tout paiement reçu », quel qu'en soit le type.
        $lastPaidAt = collect([
            $this->leasePaymentsOf($agencyId)->where('lease_payments.status', PaymentStatus::Paid->value)
                ->max('lease_payments.paid_at'),
            $this->bookingPaymentsOf($agencyId)->where('booking_payments.status', PaymentStatus::Paid->value)
                ->max('booking_payments.paid_at'),
        ])->filter()->map(fn ($instant) => Carbon::parse($instant))->max();

        $openComplaints = DB::table('property_reports as pr')
            ->join('properties as p', 'p.id', '=', 'pr.property_id')
            ->where('p.agency_id', $agencyId)
            ->whereNull('pr.resolved_at')
            ->count();

        return $this->json([
            'data' => [
                'active_properties' => (clone $properties)
                    ->whereIn('status', [PropertyStatus::Available->value, PropertyStatus::Published->value])
                    ->count(),
                'properties_in_moderation' => (clone $properties)
                    ->where('status', PropertyStatus::PendingReview->value)
                    ->count(),
                'transactions_30d' => (int) ($leases->n ?? 0) + (int) ($bookings->n ?? 0),
                'revenue_30d' => round((float) ($leases->total ?? 0) + (float) ($bookings->total ?? 0), 2),
                // TCK-1116 (P94.01) — `MAX(paid_at)` sort de PostgreSQL sans fuseau (`2026-10-18 21:54:01`),
                // que le front lirait dans le fuseau du navigateur : un instant ADR-0018.
                'last_platform_payment_at' => $lastPaidAt?->utc()->format(DATE_ATOM),
                'open_complaints' => $openComplaints,
            ],
        ]);
    }

    /** Les échéances des baux non supprimés de l'agence (les échéances supprimées sont écartées par Eloquent). */
    private function leasePaymentsOf(int $agencyId): Builder
    {
        return LeasePayment::query()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->where('leases.agency_id', $agencyId)
            ->whereNull('leases.deleted_at');
    }

    /** Les paiements des réservations non supprimées des biens non supprimés de l'agence. */
    private function bookingPaymentsOf(int $agencyId): Builder
    {
        return BookingPayment::query()
            ->join('bookings', 'bookings.id', '=', 'booking_payments.booking_id')
            ->join('properties', 'properties.id', '=', 'bookings.property_id')
            ->where('properties.agency_id', $agencyId)
            ->whereNull('bookings.deleted_at')
            ->whereNull('properties.deleted_at');
    }

    public function team(Request $request, Agency $agency): JsonResponse
    {
        // TCK-1137 (P87.04) — les deux branches groupées, comme `AgencyController::listMembers` :
        // sans groupe, un `filter[status]` ne s'appliquait qu'aux propriétaires. Le tri par défaut
        // passe par `defaultSorts()`, pour qu'un `sort=` demandé l'emporte, et en ICU (TCK-1136).
        // P120.02 (TCK-1244) — les administrateurs aussi, par la portée commune `membreDe`.
        $base = User::query()->membreDe((int) $agency->id);

        // TCK-1780 (P176.01) — les trois profils d'agence préchargés DANS l'agence lue : `roles`
        // vaut `profileTypes()`, qui empilait sinon ceux de toutes les agences du compte (l'agent
        // de A qui administre B sortait `agency_admin` dans l'équipe de A). Les autres types
        // (plateforme, prestataire, rôles dérivés) restent ceux du compte, comme TCK-1717.
        $dansLAgence = fn ($profils) => $profils->where('agency_id', $agency->id);

        $users = User::buildQuery($base, $request)
            ->defaultSorts(...[...User::nameSorts(), 'id'])
            ->with([
                'agencyAdminProfiles' => $dansLAgence,
                'agentProfiles' => $dansLAgence,
                'ownerProfiles' => $dansLAgence,
                'serviceProviderProfile',
                'platformProfile',
            ])
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
                'last_login_at' => $this->instant($user->last_login_at),
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

        // P119.04 (TCK-1275) — sans `sort=`, du plus récent au plus ancien, départagé par `id` ;
        // la pertinence d'une recherche en tête (`defaultSortsWithRelevance()`, après `buildQuery()`).
        $query = Property::buildQuery(
            Property::query()->where('agency_id', $agency->id),
            $request,
        );
        $query->defaultSorts(...Property::defaultSortsWithRelevance('-created_at', '-id'))
            ->with(['address', 'agency']);

        $properties = $query->paginate(min(max((int) $request->query('per_page', 15), 1), 100));

        return $this->paginated($properties, PropertyResource::collection($properties)->resolve($request));
    }

    private static function readsPeople(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof User && $user->hasPlatformAbility(PlatformAbility::UsersView);
    }
}
