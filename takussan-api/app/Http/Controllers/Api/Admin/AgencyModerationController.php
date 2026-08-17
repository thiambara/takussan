<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\AgencyResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-144 — Agency moderation (super-admin only). The verify / suspend /
 * unverify lifecycle is mapped onto `AgencyStatus` because the data model
 * already carries `is_verified` + `verified_at` — no schema change.
 *
 *   verify   → status=Active,    is_verified=true,  verified_at=now()
 *   suspend  → status=Suspended  (verification flag preserved)
 *   unverify → status=Inactive,  is_verified=false, verified_at=null
 *
 * Each transition writes a `super_admin_agency_*` activity log entry tied to
 * the actor and the target agency.
 */
class AgencyModerationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Agency::query()
            ->select('agencies.*')
            ->withCount('properties')
            ->selectSub($this->memberCountSubquery(), 'members_count')
            ->selectSub($this->lastActivitySubquery(), 'last_activity_at');

        if ($status = $request->string('filter.status')->trim()->value()) {
            if ($enum = AgencyStatus::tryFrom($status)) {
                $query->where('status', $enum);
            }
        }

        if ($search = $request->string('filter.search')->trim()->value()) {
            $query->where(function ($q) use ($search): void {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($createdFrom = $request->string('filter.created_from')->trim()->value()) {
            $query->whereDate('agencies.created_at', '>=', $createdFrom);
        }

        if ($createdTo = $request->string('filter.created_to')->trim()->value()) {
            $query->whereDate('agencies.created_at', '<=', $createdTo);
        }

        $sort = (string) $request->query('sort', '-created_at');
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $field = ltrim($sort, '-');
        $sorts = [
            'created_at' => 'agencies.created_at',
            'name' => 'agencies.name',
            'members_count' => 'members_count',
            'properties_count' => 'properties_count',
        ];

        if (isset($sorts[$field])) {
            $query->orderBy($sorts[$field], $direction);
        } else {
            $query->orderByDesc('agencies.created_at');
        }

        $perPage = (int) ($request->query('per_page') ?? 15);
        $agencies = $query->paginate($perPage > 0 ? min($perPage, 100) : 15);

        return $this->paginated($agencies, AgencyResource::collection($agencies)->resolve($request));
    }

    private function memberCountSubquery(): string
    {
        return <<<'SQL'
            select count(*) from (
                select owner_profiles.user_id
                from owner_profiles
                where owner_profiles.agency_id = agencies.id
                    and owner_profiles.deleted_at is null
                    and owner_profiles.status = 'active'
                union
                select agent_profiles.user_id
                from agent_profiles
                where agent_profiles.agency_id = agencies.id
                    and agent_profiles.deleted_at is null
                    and agent_profiles.status = 'active'
                union
                select broker_profiles.user_id
                from broker_profiles
                inner join broker_agency_collaborations
                    on broker_agency_collaborations.broker_profile_id = broker_profiles.id
                where broker_agency_collaborations.agency_id = agencies.id
                    and broker_agency_collaborations.deleted_at is null
                    and broker_agency_collaborations.status = 'active'
                    and broker_profiles.deleted_at is null
                union
                select service_provider_profiles.user_id
                from service_provider_profiles
                inner join service_provider_agency_collaborations
                    on service_provider_agency_collaborations.service_provider_profile_id = service_provider_profiles.id
                where service_provider_agency_collaborations.agency_id = agencies.id
                    and service_provider_agency_collaborations.deleted_at is null
                    and service_provider_agency_collaborations.status = 'active'
                    and service_provider_profiles.deleted_at is null
            ) as agency_member_users
        SQL;
    }

    private function lastActivitySubquery(): string
    {
        return <<<'SQL'
            select max(last_at) from (
                select agencies.updated_at as last_at
                union all
                select max(properties.updated_at)
                from properties
                where properties.agency_id = agencies.id
                    and properties.deleted_at is null
                union all
                select max(owner_profiles.updated_at)
                from owner_profiles
                where owner_profiles.agency_id = agencies.id
                    and owner_profiles.deleted_at is null
                union all
                select max(agent_profiles.updated_at)
                from agent_profiles
                where agent_profiles.agency_id = agencies.id
                    and agent_profiles.deleted_at is null
            ) as agency_activity
        SQL;
    }

    public function verify(Request $request, Agency $agency): JsonResponse
    {
        abort_unless(
            $agency->kycDossier?->status === KycDossierStatus::Verified,
            422,
            'Agency KYC must be verified before agency verification.',
        );

        return $this->transition($request, $agency, AgencyStatus::Active, 'super_admin_agency_verified', [
            'is_verified' => true,
            'verified_at' => now(),
        ]);
    }

    public function suspend(Request $request, Agency $agency): JsonResponse
    {
        return $this->transition($request, $agency, AgencyStatus::Suspended, 'super_admin_agency_suspended');
    }

    public function unverify(Request $request, Agency $agency): JsonResponse
    {
        return $this->transition($request, $agency, AgencyStatus::Inactive, 'super_admin_agency_unverified', [
            'is_verified' => false,
            'verified_at' => null,
        ]);
    }

    private function transition(
        Request $request,
        Agency $agency,
        AgencyStatus $next,
        string $event,
        array $extra = [],
    ): JsonResponse {
        $previous = $agency->status?->value;
        $agency->fill(['status' => $next] + $extra)->save();

        activity('Agency')
            ->performedOn($agency)
            ->causedBy($request->user())
            ->withProperties(['old_status' => $previous, 'new_status' => $next->value])
            ->event($event)
            ->log("Agency {$event}");

        return $this->json([
            'data' => (new AgencyResource($agency->refresh()))->resolve($request),
        ]);
    }
}
