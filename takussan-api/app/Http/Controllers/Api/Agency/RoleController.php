<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Agency\StoreAgencyRoleRequest;
use App\Http\Requests\Agency\SyncCapabilitiesRequest;
use App\Http\Requests\Agency\UpdateAgencyRoleRequest;
use App\Http\Resources\Agency\AgencyRoleResource;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-279 — CRUD des rôles d'une agence (`/api/agencies/{agency}/roles`).
 *
 * Contrôleur mince : les règles qui peuvent casser une autorisation sont
 * dans {@see AgencyRoleService}.
 */
class RoleController extends Controller
{
    public function __construct(
        private readonly AgencyRoleService $service,
    ) {}

    public function index(Agency $agency, Request $request): JsonResponse
    {
        Gate::authorize('viewAny', [AgencyRole::class, $agency]);

        $paginator = AgencyRole::buildQuery(
            AgencyRole::query()->where('agency_id', $agency->id)->with('capabilities'),
            $request,
        )
            ->defaultSort('name')
            ->paginate((int) $request->input('per_page', 50));

        return $this->paginated($paginator, AgencyRoleResource::collection($paginator)->toArray($request));
    }

    public function show(Agency $agency, AgencyRole $role, Request $request): JsonResponse
    {
        abort_unless((int) $role->agency_id === (int) $agency->id, 404);
        Gate::authorize('view', $role);

        return $this->json([
            'data' => AgencyRoleResource::make($role->load('capabilities'))->toArray($request),
        ]);
    }

    public function store(Agency $agency, StoreAgencyRoleRequest $request): JsonResponse
    {
        $role = $this->service->create($agency, $request->validated());

        return $this->json([
            'data' => AgencyRoleResource::make($role->load('capabilities'))->toArray($request),
        ], 201);
    }

    public function update(Agency $agency, AgencyRole $role, UpdateAgencyRoleRequest $request): JsonResponse
    {
        abort_unless((int) $role->agency_id === (int) $agency->id, 404);

        $role->fill($request->validated())->save();

        return $this->json([
            'data' => AgencyRoleResource::make($role->fresh()->load('capabilities'))->toArray($request),
        ]);
    }

    /**
     * AC5 — 409 Conflict avec la liste des profils en cause. Le 409 précède
     * la suppression : la FK `restrictOnDelete` produirait sinon une erreur
     * base illisible côté client.
     */
    public function destroy(Agency $agency, AgencyRole $role, Request $request): JsonResponse
    {
        abort_unless((int) $role->agency_id === (int) $agency->id, 404);
        Gate::authorize('delete', $role);

        $blocking = $this->service->blockingProfiles($role);
        if ($blocking !== []) {
            return $this->json([
                'message' => 'Ce rôle est encore attribué : réaffectez les profils avant de le supprimer.',
                'profiles' => $blocking,
            ], 409);
        }

        $role->delete();

        return $this->json(['message' => 'Rôle supprimé.']);
    }

    /**
     * AC6 — `PUT .../capabilities` remplace l'ensemble des capacités.
     */
    public function syncCapabilities(Agency $agency, AgencyRole $role, SyncCapabilitiesRequest $request): JsonResponse
    {
        abort_unless((int) $role->agency_id === (int) $agency->id, 404);

        $capabilities = array_map(
            static fn (string $value): Capability => Capability::from($value),
            $request->validated()['capabilities'],
        );

        $role = $this->service->replaceCapabilities($role, $capabilities);

        return $this->json([
            'data' => AgencyRoleResource::make($role->load('capabilities'))->toArray($request),
        ]);
    }
}
