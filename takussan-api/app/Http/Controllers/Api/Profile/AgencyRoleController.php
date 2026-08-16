<?php

namespace App\Http\Controllers\Api\Profile;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Agency\AssignAgencyRoleRequest;
use App\Http\Resources\Agency\AgencyRoleResource;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-279 — `PATCH /api/profiles/{profile}/agency-role` (AC7).
 *
 * Le type de profil vient du corps (`profile_type`) : voir
 * {@see AssignAgencyRoleRequest} pour la raison — un id seul ne désigne pas
 * un profil polymorphe.
 */
class AgencyRoleController extends Controller
{
    public function __construct(
        private readonly AgencyRoleService $service,
    ) {}

    public function update(int $profile, AssignAgencyRoleRequest $request): JsonResponse
    {
        $data = $request->validated();
        $type = AgencyRoleBaseType::from((string) $data['profile_type']);
        $class = $type->profileClass();
        abort_if($class === null, 404);

        /** @var Model $model */
        $model = $class::query()->findOrFail($profile);

        $agency = $model->agency;
        abort_if($agency === null, 404);

        Gate::authorize('assign', [AgencyRole::class, $agency]);

        $role = AgencyRole::query()->findOrFail((int) $data['agency_role_id']);

        $model = $this->service->assign($model, $role);

        return $this->json([
            'data' => [
                'id' => $model->getKey(),
                'profile_type' => $type->value,
                'agency_id' => $model->agency_id,
                'agency_role_id' => $model->agency_role_id,
                'agency_role' => AgencyRoleResource::make($role->fresh()->load('capabilities'))
                    ->toArray($request),
            ],
        ]);
    }
}
