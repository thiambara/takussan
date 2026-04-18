<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PropertyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Property::allThroughRequest($request)->with(['address']);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('user_id', $user->id);
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        $paginator = $query->paginate((int) $request->input('per_page', 20));

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
            'status' => ['sometimes', Rule::enum(PropertyStatus::class)],
            'visibility' => ['sometimes', Rule::enum(PropertyVisibility::class)],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'currency' => ['sometimes', Rule::enum(Currency::class)],
            'area' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'furnished' => ['sometimes', 'boolean'],
            'featured' => ['sometimes', 'boolean', Rule::prohibitedIf(! $request->user()->hasRole(['admin', 'super_admin']))],
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
            'Sold or rented properties cannot be published.'
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
