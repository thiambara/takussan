<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\UserDetailResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Spatie\Activitylog\Models\Activity;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

class UserDetailController extends Controller
{
    public function show(Request $request, User $user): JsonResponse
    {
        $user->load([
            'roles',
            'agentProfiles.agency',
            'ownerProfiles.agency',
            'brokerProfile',
            'serviceProviderProfile',
        ]);

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
}
