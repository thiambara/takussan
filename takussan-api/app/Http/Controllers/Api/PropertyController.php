<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\PropertyBulkArchiveRequest;
use App\Http\Requests\PropertyDuplicateRequest;
use App\Http\Resources\PropertyResource;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Services\Property\HierarchyService;
use App\Services\Property\PropertyBulkArchiveService;
use App\Services\Property\PropertyDuplicationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;

class PropertyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Property::query()->with(['address']);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $base->where(function ($q) use ($user) {
                $q->where('user_id', $user->id);
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        $paginator = Property::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => PropertyResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'type' => ['required', Rule::enum(PropertyType::class)],
            'contract_type' => ['required', Rule::enum(ContractType::class)],
            'rent_period' => ['nullable', Rule::enum(RentPeriod::class)],
            'status' => ['nullable', Rule::enum(PropertyStatus::class)],
            'visibility' => ['nullable', Rule::enum(PropertyVisibility::class)],
            'price' => ['required', 'numeric', 'min:0'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'area' => ['nullable', 'integer', 'min:0'],
            'bedrooms' => ['nullable', 'integer', 'min:0'],
            'bathrooms' => ['nullable', 'integer', 'min:0'],
            'furnished' => ['nullable', 'boolean'],
            'floor_number' => ['nullable', 'integer'],
            'total_floors' => ['nullable', 'integer'],
            'year_built' => ['nullable', 'integer'],
            'parking_spaces' => ['nullable', 'integer'],
            'available_from' => ['nullable', 'date'],
            'agency_id' => ['nullable', 'exists:agencies,id'],
            'address' => ['nullable', 'array'],
            'address.street' => ['nullable', 'string'],
            'address.neighborhood' => ['nullable', 'string'],
            'address.city' => ['nullable', 'string'],
            'address.region' => ['nullable', 'string'],
            'address.country' => ['nullable', 'string', 'size:2'],
            'address.latitude' => ['nullable', 'numeric'],
            'address.longitude' => ['nullable', 'numeric'],
        ]);

        if (! $request->user()->hasRole(['admin', 'super_admin'])) {
            $data['agency_id'] = $request->user()->agency_id;
        }

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
    }

    public function show(Request $request, Property $property): JsonResponse
    {
        $this->authorizeAccess($request, $property);

        return $this->json([
            'data' => PropertyResource::make($property->load(['address', 'media', 'owner']))->toArray($request),
        ]);
    }

    public function update(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'type' => ['sometimes', Rule::enum(PropertyType::class)],
            'contract_type' => ['sometimes', Rule::enum(ContractType::class)],
            'rent_period' => ['sometimes', 'nullable', Rule::enum(RentPeriod::class)],
            'status' => ['sometimes', Rule::enum(PropertyStatus::class)],
            'visibility' => ['sometimes', Rule::enum(PropertyVisibility::class)],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'currency' => ['sometimes', Rule::enum(Currency::class)],
            'area' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'furnished' => ['sometimes', 'boolean'],
            'featured' => ['sometimes', 'boolean', Rule::prohibitedIf(! $request->user()->hasRole(['admin', 'super_admin']))],
            'parent_id' => ['sometimes', 'nullable', 'integer', 'exists:properties,id'],
            'available_from' => ['sometimes', 'nullable', 'date'],
            'address' => ['sometimes', 'nullable', 'array'],
            'address.street' => ['sometimes', 'nullable', 'string'],
            'address.neighborhood' => ['sometimes', 'nullable', 'string'],
            'address.city' => ['sometimes', 'nullable', 'string'],
            'address.region' => ['sometimes', 'nullable', 'string'],
            'address.country' => ['sometimes', 'nullable', 'string', 'size:2'],
            'address.latitude' => ['sometimes', 'nullable', 'numeric'],
            'address.longitude' => ['sometimes', 'nullable', 'numeric'],
        ]);

        if (array_key_exists('parent_id', $data)) {
            $newParentId = $data['parent_id'];
            if ($newParentId !== null) {
                $parent = Property::query()->findOrFail($newParentId);
                $this->authorizeManage($request, $parent);
            }
            app(HierarchyService::class)->validateAttachment($property, $newParentId);
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
            $property->status === PropertyStatus::Available,
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

    public function children(Request $request, Property $property): JsonResponse
    {
        $this->authorizeAccess($request, $property);

        $base = Property::query()->where('parent_id', $property->id)->with('address');

        $paginator = Property::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => PropertyResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function ancestors(Request $request, Property $property, HierarchyService $hierarchy): JsonResponse
    {
        $this->authorizeAccess($request, $property);

        $chain = $hierarchy->ancestors($property->load('parent'));

        return $this->json([
            'data' => PropertyResource::collection($chain)->toArray($request),
            'meta' => [
                'total' => $chain->count(),
            ],
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
        if ($user->hasRole(['admin', 'super_admin'])) {
            return;
        }
        abort(403);
    }

    protected function authorizeManage(Request $request, Property $property): void
    {
        $this->authorizeAccess($request, $property);
    }
}
