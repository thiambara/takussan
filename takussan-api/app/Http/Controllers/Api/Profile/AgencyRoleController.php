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
use Illuminate\Validation\ValidationException;

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

        /** @var Model|null $model */
        $model = $class::query()->find($profile);

        // TCK-1772 (P62.07, décision du porteur) — le profil absent, sans agence ou d'une agence où
        // l'appelant ne peut pas affecter de rôle rend le même 404 : un 403 disait que le profil existe.
        $agency = $model?->agency;
        abort_if($agency === null || Gate::denies('assign', [AgencyRole::class, $agency]), 404);

        // Le rôle absent reçoit la réponse du rôle d'une autre agence (`AgencyRoleService::assign`).
        $role = AgencyRole::query()->find((int) $data['agency_role_id'])
            ?? throw ValidationException::withMessages([
                'agency_role_id' => __('errors.agency_role.other_agency'),
            ]);

        $model = $this->service->assign($model, $role);

        return $this->json([
            'data' => [
                'id' => $model->getKey(),
                'profile_type' => $type->value,
                'agency_id' => $model->agency_id,
                'agency_role_id' => $model->agency_role_id,
                'agency_role' => AgencyRoleResource::make($role->fresh()->load('capabilities'))
                    ->resolve($request),
            ],
        ]);
    }
}
