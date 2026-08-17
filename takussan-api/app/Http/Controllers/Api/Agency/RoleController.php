<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Agency\StoreAgencyRoleRequest;
use App\Http\Requests\Agency\SyncCapabilitiesRequest;
use App\Http\Requests\Agency\UpdateAgencyRoleRequest;
use App\Http\Resources\Agency\AgencyRoleResource;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Database\Eloquent\Model;
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

        return $this->json([
            'data' => AgencyRoleResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    /**
     * `GET /api/agencies/{agency}/role-assignments?user_ids[]=…`
     *
     * Quel rôle porte chaque profil agence-scopé des utilisateurs demandés.
     *
     * ── Pourquoi cet endpoint existe ────────────────────────────────────
     * La console Équipe (TCK-277) doit afficher `agency_role.name` dans sa
     * colonne « Rôle » et proposer une réaffectation. Elle liste des
     * UTILISATEURS (`GET /api/users`, `UserResource`), qui n'exposent ni
     * l'id du profil ni son rôle — et ne peuvent pas l'exposer sans
     * choisir pour tout le produit lequel des N profils d'un utilisateur
     * est « le » profil. Ici, la question est posée pour une agence donnée,
     * donc elle a une réponse : la liste, par utilisateur, de ses profils
     * DANS cette agence.
     *
     * `PATCH /profiles/{p}/agency-role` a besoin du couple
     * `(profile_id, profile_type)` — un id nu ne désigne pas un profil
     * polymorphe. C'est exactement ce que cette réponse porte.
     *
     * ── `user_ids` est REQUIS, et c'est un choix ────────────────────────
     * Sans lui, la réponse serait la liste non bornée des profils d'une
     * agence, qu'il aurait fallu paginer ou tronquer. Une troncature
     * silencieuse afficherait « — » dans la colonne Rôle de membres qui en
     * ont un — un vide qui se lit comme une donnée. Borner l'entrée rend
     * le cas inexprimable : l'appelant demande les 20 lignes qu'il affiche.
     *
     * Il se lit en LISTE SÉPARÉE PAR DES VIRGULES (`?user_ids=3,7,12`), et
     * non en `user_ids[]=`. C'est la seule forme que produit le sérialiseur
     * canonique du front (`buildQueryString`, échappatoire `extra`) : lui en
     * demander une autre obligerait un appelant à construire sa query string
     * à la main, ce que la convention des sparse fieldsets existe pour
     * éviter. La forme tableau reste acceptée.
     */
    public function assignments(Agency $agency, Request $request): JsonResponse
    {
        Gate::authorize('viewAny', [AgencyRole::class, $agency]);

        $raw = $request->query('user_ids');
        $request->merge([
            'user_ids' => is_string($raw)
                ? array_values(array_filter(explode(',', $raw), static fn (string $v): bool => $v !== ''))
                : $raw,
        ]);

        $validated = $request->validate([
            'user_ids' => ['required', 'array', 'min:1', 'max:200'],
            'user_ids.*' => ['integer'],
        ]);
        $userIds = array_map('intval', $validated['user_ids']);

        $rows = [];
        foreach (AgencyRoleBaseType::assignableTypes() as $type) {
            /** @var class-string<Model>|null $class */
            $class = $type->profileClass();
            if ($class === null) {
                continue;
            }

            foreach (
                $class::query()
                    ->where('agency_id', $agency->id)
                    ->whereIn('user_id', $userIds)
                    ->with('agencyRole')
                    ->get() as $profile
            ) {
                $rows[] = [
                    'profile_id' => (int) $profile->getKey(),
                    'profile_type' => $type->value,
                    'user_id' => (int) $profile->user_id,
                    'agency_role_id' => (int) $profile->agency_role_id,
                    'agency_role_name' => $profile->agencyRole?->name,
                ];
            }
        }

        return $this->json(['data' => $rows]);
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
