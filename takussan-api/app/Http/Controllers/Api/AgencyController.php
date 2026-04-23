<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\AgencyResource;
use App\Http\Resources\UserResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class AgencyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $paginator = Agency::buildQuery(null, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => AgencyResource::collection($paginator)->toArray($request),
            'meta' => ['total' => $paginator->total(), 'current_page' => $paginator->currentPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $alreadyOwns = Agency::where('primary_admin_id', $user->id)->exists();
        abort_if(
            $alreadyOwns && ! $user->hasRole(['admin', 'super_admin']),
            422,
            'You already administer an agency.'
        );

        $data = $request->validate([
            'name' => ['required', 'string'],
            'license_number' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'phone' => ['nullable', 'string'],
            'website' => ['nullable', 'url'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'status' => ['nullable', Rule::enum(AgencyStatus::class)],
        ]);

        $agency = Agency::create(array_merge($data, [
            'primary_admin_id' => $user->id,
            'status' => $data['status'] ?? AgencyStatus::Active->value,
        ]));

        return $this->json(['data' => AgencyResource::make($agency)->toArray($request)], 201);
    }

    public function show(Request $request, Agency $agency): JsonResponse
    {
        return $this->json(['data' => AgencyResource::make($agency)->toArray($request)]);
    }

    public function update(Request $request, Agency $agency): JsonResponse
    {
        abort_unless($agency->primary_admin_id === $request->user()->id || $request->user()->hasRole(['admin', 'super_admin']), 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string'],
            'license_number' => ['sometimes', 'nullable', 'string'],
            'description' => ['sometimes', 'nullable', 'string'],
            'email' => ['sometimes', 'nullable', 'email'],
            'phone' => ['sometimes', 'nullable', 'string'],
            'website' => ['sometimes', 'nullable', 'url'],
            'commission_rate' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'settings' => ['sometimes', 'nullable', 'array'],
        ]);

        $agency->fill($data)->save();

        return $this->json(['data' => AgencyResource::make($agency->refresh())->toArray($request)]);
    }

    public function destroy(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            $user->hasRole(['admin', 'super_admin']) || $agency->primary_admin_id === $user->id,
            403
        );

        $agency->delete();

        return $this->json(null, 204);
    }

    /**
     * List members of an agency. Supports spatie filters (role, search) and
     * sparse fieldsets. The `role` filter is honoured post-query because
     * spatie roles live on a separate pivot.
     */
    public function listMembers(Request $request, Agency $agency): JsonResponse
    {
        $this->authorizeAdmin($request, $agency);

        $query = User::buildQuery(User::query()->where('agency_id', $agency->id), $request)
            ->defaultSort('-created_at');

        // Optional post-filter on role — spatie roles aren't a regular column.
        $role = $request->query('filter.role') ?? data_get($request->query('filter', []), 'role');
        if ($role) {
            $query->whereHas('roles', fn ($q) => $q->where('name', $role));
        }

        $paginator = $query->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => UserResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }

    public function addAgent(Request $request, Agency $agency): JsonResponse
    {
        $this->authorizeAdmin($request, $agency);

        $data = $request->validate([
            'user_id' => ['nullable', 'integer', 'exists:users,id', 'required_without:email'],
            'email' => ['nullable', 'email', 'required_without:user_id'],
            'role' => ['nullable', 'string', Rule::in(['agent', 'agency_admin'])],
        ]);

        $target = isset($data['user_id'])
            ? User::findOrFail($data['user_id'])
            : User::where('email', $data['email'])->first();

        abort_if($target === null, 422, __('messages.user_not_found_by_email'));
        abort_if($target->agency_id !== null && $target->agency_id !== $agency->id, 422, __('messages.user_already_in_agency'));

        $target->update(['agency_id' => $agency->id]);

        $role = $data['role'] ?? 'agent';
        Role::findOrCreate($role, 'web');
        if (! $target->hasRole($role)) {
            $target->assignRole($role);
        }

        return $this->json([
            'data' => [
                'user_id' => $target->id,
                'agency_id' => $agency->id,
                'role' => $role,
                'user' => UserResource::make($target->refresh())->toArray($request),
            ],
        ]);
    }

    public function removeAgent(Request $request, Agency $agency, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, $agency);
        abort_if($user->agency_id !== $agency->id, 422, __('messages.user_not_in_agency'));
        abort_if($user->id === $agency->primary_admin_id, 422, __('messages.cannot_remove_primary_admin'));

        // Guard: block removing the last agency_admin of the agency so an
        // admin doesn't accidentally lock themselves + their team out of
        // admin-only views (UI also hides the action, but enforce server-side).
        if ($user->hasRole('agency_admin')) {
            $remainingAdmins = User::where('agency_id', $agency->id)
                ->whereHas('roles', fn ($q) => $q->where('name', 'agency_admin'))
                ->where('id', '!=', $user->id)
                ->count();
            abort_if($remainingAdmins === 0, 422, __('messages.cannot_remove_last_agency_admin'));
        }

        $user->update(['agency_id' => null]);
        foreach (['agent', 'agency_admin'] as $role) {
            if ($user->hasRole($role)) {
                $user->removeRole($role);
            }
        }

        return $this->json(['data' => ['user_id' => $user->id, 'removed' => true]]);
    }

    protected function authorizeAdmin(Request $request, Agency $agency): void
    {
        $user = $request->user();
        abort_unless(
            $user->hasRole(['admin', 'super_admin']) || $agency->primary_admin_id === $user->id,
            403,
        );
    }
}
