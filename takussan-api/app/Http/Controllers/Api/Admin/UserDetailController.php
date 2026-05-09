<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\UserDetailResource;
use App\Http\Resources\Api\Admin\UserListResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Spatie\Activitylog\Models\Activity;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

class UserDetailController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query();

        if ($search = $request->string('filter.search')->trim()->value()) {
            $query->where(function (Builder $q) use ($search): void {
                if (ctype_digit($search)) {
                    $q->orWhere('id', (int) $search);
                }

                $q->orWhere('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        if ($status = $request->string('filter.status')->trim()->value()) {
            $query->where('status', $status);
        }

        if ($role = $request->string('filter.role')->trim()->value()) {
            $query->whereExists(function ($sub) use ($role): void {
                $sub->selectRaw('1')
                    ->from('model_has_roles')
                    ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
                    ->whereColumn('model_has_roles.model_id', 'users.id')
                    ->where('model_has_roles.model_type', (new User)->getMorphClass())
                    ->where('roles.name', $role);
            });
        }

        if ($agencyId = $request->string('filter.agency_id')->trim()->value()) {
            $query->where(function (Builder $q) use ($agencyId): void {
                $q->whereHas('agentProfiles', fn (Builder $profile) => $profile->where('agency_id', $agencyId))
                    ->orWhereHas('ownerProfiles', fn (Builder $profile) => $profile->where('agency_id', $agencyId));
            });
        }

        if ($request->has('filter.email_verified')) {
            $this->booleanFilter($request->query('filter')['email_verified'] ?? null)
                ? $query->whereNotNull('email_verified_at')
                : $query->whereNull('email_verified_at');
        }

        if ($request->has('filter.two_factor_enabled')) {
            $query->where('two_factor_enabled', $this->booleanFilter($request->query('filter')['two_factor_enabled'] ?? null));
        }

        $sort = (string) $request->query('sort', '-created_at');
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $field = ltrim($sort, '-');
        $sorts = ['created_at', 'first_name', 'last_name', 'email', 'status', 'last_login_at'];
        $query->orderBy(in_array($field, $sorts, true) ? $field : 'created_at', $direction);

        $paginator = $query->paginate(min(max((int) $request->query('per_page', 20), 1), 100));
        $users = $paginator->getCollection()->load(['agentProfiles.agency', 'ownerProfiles.agency']);
        $this->attachRoleRows($users);

        return $this->json([
            'data' => UserListResource::collection($users)->resolve($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }

    public function show(Request $request, User $user): JsonResponse
    {
        $user->load([
            'roles',
            'agentProfiles.agency',
            'ownerProfiles.agency',
            'brokerProfile',
            'serviceProviderProfile',
        ]);
        $this->attachRoleRows(collect([$user]));

        return $this->json([
            'data' => (new UserDetailResource($user))->resolve($request),
        ]);
    }

    public function sessions(Request $request, User $user): JsonResponse
    {
        $tokens = $user->tokens()
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->orderByDesc('last_used_at')
            ->orderByDesc('created_at')
            ->paginate(min(max((int) $request->query('per_page', 20), 1), 100));

        return $this->json([
            'data' => $tokens->getCollection()->map(fn (PersonalAccessToken $token) => [
                'id' => $token->id,
                'name' => $token->name,
                'last_used_at' => $token->last_used_at?->toIso8601String(),
                'ip' => null,
                'user_agent' => null,
                'created_at' => $token->created_at?->toIso8601String(),
                'expires_at' => $token->expires_at?->toIso8601String(),
            ])->values()->all(),
            'meta' => [
                'total' => $tokens->total(),
                'current_page' => $tokens->currentPage(),
                'last_page' => $tokens->lastPage(),
                'per_page' => $tokens->perPage(),
            ],
        ]);
    }

    public function activity(Request $request, User $user): JsonResponse
    {
        $query = QueryBuilder::for(Activity::query(), $request)
            ->where(function ($q) use ($user): void {
                $q->where(fn ($inner) => $inner
                    ->where('causer_type', User::class)
                    ->where('causer_id', $user->id))
                    ->orWhere(fn ($inner) => $inner
                        ->where('subject_type', User::class)
                        ->where('subject_id', $user->id));
            })
            ->allowedFilters(
                AllowedFilter::exact('event'),
                AllowedFilter::callback('date_from', fn ($q, $value) => $q->where('created_at', '>=', $value)),
                AllowedFilter::callback('date_to', fn ($q, $value) => $q->where('created_at', '<=', $value)),
            )
            ->allowedSorts('created_at', 'event')
            ->defaultSort('-created_at');

        $activity = $query->paginate(min(max((int) $request->query('per_page', 20), 1), 100));

        return $this->json([
            'data' => $activity->getCollection()->map(fn (Activity $log) => [
                'id' => $log->id,
                'log_name' => $log->log_name,
                'event' => $log->event,
                'description' => $log->description,
                'causer_type' => $log->causer_type,
                'causer_id' => $log->causer_id,
                'subject_type' => $log->subject_type,
                'subject_id' => $log->subject_id,
                'properties' => $log->properties?->toArray(),
                'created_at' => $log->created_at?->toIso8601String(),
            ])->values()->all(),
            'meta' => [
                'total' => $activity->total(),
                'current_page' => $activity->currentPage(),
                'last_page' => $activity->lastPage(),
                'per_page' => $activity->perPage(),
            ],
        ]);
    }

    private function attachRoleRows($users): void
    {
        $ids = $users->pluck('id');
        if ($ids->isEmpty()) {
            return;
        }

        $rows = DB::table('model_has_roles')
            ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
            ->where('model_has_roles.model_type', (new User)->getMorphClass())
            ->whereIn('model_has_roles.model_id', $ids)
            ->orderBy('roles.name')
            ->get([
                'model_has_roles.model_id',
                'roles.name',
                'model_has_roles.agency_id as team_id',
            ])
            ->groupBy('model_id');

        $users->each(function (User $user) use ($rows): void {
            $user->admin_role_rows = collect($rows->get($user->id, []))
                ->map(fn ($row) => [
                    'name' => $row->name,
                    'team_id' => $row->team_id,
                ])
                ->values()
                ->all();
        });
    }

    private function booleanFilter(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }
}
