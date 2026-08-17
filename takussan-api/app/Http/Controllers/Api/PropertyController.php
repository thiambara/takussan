<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\AssignAgentPropertyRequest;
use App\Http\Requests\Api\StorePropertyRequest;
use App\Http\Requests\Api\UpdateStatusPropertyRequest;
use App\Http\Requests\Api\UpdateVisibilityPropertyRequest;
use App\Http\Requests\PropertyBulkArchiveRequest;
use App\Http\Requests\PropertyDuplicateRequest;
use App\Http\Requests\UpdatePropertyRequest;
use App\Http\Resources\PropertyResource;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use App\Services\Billing\QuotaResolver;
use App\Services\Property\PropertyBulkArchiveService;
use App\Services\Property\PropertyDuplicationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

class PropertyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Property::query()->with(['address', 'owner', 'collaborators.user']);

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('user_id', $user->id);
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        $statusFilter = $request->query('filter.status')
            ?? data_get($request->query('filter', []), 'status');
        $includeArchived = filter_var(
            $request->query('include_archived', false),
            FILTER_VALIDATE_BOOL,
        );
        if (! $includeArchived && ! $statusFilter) {
            $base->where('status', '!=', PropertyStatus::Archived);
        }

        $paginator = Property::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, PropertyResource::collection($paginator)->toArray($request));
    }

    public function store(StorePropertyRequest $request): JsonResponse
    {
        $data = $request->validated();

        if (! $request->user()->isSuperAdmin()) {
            $data['agency_id'] = $request->user()->agency_id;
        }

        if (! empty($data['agency_id'])) {
            app(QuotaResolver::class)->assertCanCreateActiveListing((int) $data['agency_id']);
        }

        try {
            $property = DB::transaction(function () use ($data, $request) {
                $property = Property::create(array_merge($data, [
                    'user_id' => $request->user()->id,
                    'status' => $data['status'] ?? PropertyStatus::Draft->value,
                    'visibility' => $data['visibility'] ?? PropertyVisibility::Private->value,
                ]));

                if (! empty($data['address'])) {
                    $property->address()->create($data['address']);
                }

                return $property;
            });

            return $this->json(
                ['data' => PropertyResource::make($property->load('address'))->toArray($request)],
                201
            );
        } catch (\Throwable $e) {
            Log::error('[PropertyController::store] Failed to create property', [
                'user_id' => $request->user()?->id,
                'payload' => $request->all(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            throw $e;
        }
    }

    public function show(Request $request, Property $property): JsonResponse
    {
        $this->authorizeAccess($request, $property);

        if ($request->boolean('raw')) {
            $firstMedia = $property->getFirstMedia('photos');
            if ($firstMedia !== null) {
                Gate::authorize('viewRaw', $firstMedia);
            }
        }

        return $this->json([
            'data' => PropertyResource::make($property->load(['address', 'media', 'owner']))->toArray($request),
        ]);
    }

    public function update(UpdatePropertyRequest $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validated();

        // TCK-086 — re-parenting requires update rights on the candidate parent.
        if (array_key_exists('parent_id', $data)) {
            $newParent = $data['parent_id'] !== null ? Property::find($data['parent_id']) : null;
            abort_unless(
                Gate::forUser($request->user())->allows('updateParent', [$property, $newParent]),
                403
            );
        }

        DB::transaction(function () use ($data, $property) {
            $addressData = $data['address'] ?? null;
            unset($data['address']);

            $property->fill($data)->save();

            if ($addressData !== null) {
                $property->address
                    ? $property->address->update($addressData)
                    : $property->address()->create($addressData);
            }
        });

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),
        ]);
    }

    public function destroy(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);
        $property->delete();

        return $this->json(['message' => 'deleted'], 204);
    }

    public function publish(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);
        abort_if(
            in_array($property->status, [PropertyStatus::Sold, PropertyStatus::Rented], true),
            422,
            __('messages.property_cannot_publish')
        );
        $property->update([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),
        ]);
    }

    public function unpublish(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);
        abort_unless(
            in_array($property->status, [PropertyStatus::Available, PropertyStatus::Published], true),
            422,
            __('messages.property_cannot_unpublish')
        );
        $property->update([
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
        ]);

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),
        ]);
    }

    public function updateStatus(UpdateStatusPropertyRequest $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validated();

        $status = PropertyStatus::from($data['status']);
        $updates = ['status' => $status];

        if ($status === PropertyStatus::Archived) {
            $updates['visibility'] = PropertyVisibility::Private;
            $updates['published_at'] = null;
            $updates['archived_at'] = now();
        }

        if ($property->status === PropertyStatus::Archived && $status !== PropertyStatus::Archived) {
            $updates['archived_at'] = null;
        }

        $property->update($updates);

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load('address'))->toArray($request),
        ]);
    }

    public function updateVisibility(UpdateVisibilityPropertyRequest $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validated();

        $visibility = PropertyVisibility::from($data['visibility']);
        if ($visibility === PropertyVisibility::Public) {
            return $this->publish($request, $property);
        }

        return $this->unpublish($request, $property);
    }

    public function assignAgent(AssignAgentPropertyRequest $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validated();

        $target = User::findOrFail($data['user_id']);
        $actor = $request->user();
        $agencyId = $property->agency_id ?? $actor->agency_id;
        if ($agencyId !== null) {
            abort_unless(
                $target->agency_id === $agencyId || $target->isAgentAt($agencyId),
                422,
                __('messages.target_user_not_in_active_agency')
            );
        }

        $property->update(['user_id' => $target->id]);

        return $this->json([
            'data' => PropertyResource::make($property->refresh()->load(['address', 'owner', 'collaborators.user']))->toArray($request),
        ]);
    }

    public function recordView(Request $request, Property $property): JsonResponse
    {
        $key = 'property-view:'.$property->id.':'.$request->ip();
        if (! RateLimiter::tooManyAttempts($key, 3)) {
            RateLimiter::hit($key, 3600);
            $property->increment('views_count');
        }

        return $this->json(['data' => ['views_count' => $property->refresh()->views_count]]);
    }

    /**
     * TCK-074 — duplicate a property as a new draft.
     */
    public function duplicate(
        PropertyDuplicateRequest $request,
        Property $property,
        PropertyDuplicationService $service,
    ): JsonResponse {
        abort_unless($request->user()->can('duplicate', $property), 403);

        $clone = $service->duplicate(
            source: $property,
            actor: $request->user(),
            options: $request->only(['copy_media', 'copy_collaborators', 'title_suffix']),
        );

        return $this->json(
            ['data' => PropertyResource::make($clone->load('address'))->toArray($request)],
            201
        );
    }

    /**
     * TCK-074 — archive a batch of properties. Returns the per-id outcome.
     */
    public function bulkArchive(
        PropertyBulkArchiveRequest $request,
        PropertyBulkArchiveService $service,
    ): JsonResponse {
        abort_unless($request->user()->can('bulkArchive', Property::class), 403);

        $result = $service->archive(
            propertyIds: $request->input('property_ids'),
            actor: $request->user(),
            reason: $request->input('reason'),
        );

        return $this->json([
            'archived' => $result['archived'],
            'failed' => $result['failed'],
            'archived_ids' => $result['archived_ids'],
        ]);
    }

    protected function authorizeAccess(Request $request, Property $property): void
    {
        $user = $request->user();
        if ($user->id === $property->user_id) {
            return;
        }
        if ($user->agency_id && $user->agency_id === $property->agency_id) {
            return;
        }
        if ($user->isSuperAdmin()) {
            return;
        }
        abort(403);
    }

    protected function authorizeManage(Request $request, Property $property): void
    {
        $this->authorizeAccess($request, $property);
    }
}
