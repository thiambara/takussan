<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\InventoryStoreRequest;
use App\Http\Requests\InventoryUpdateRequest;
use App\Http\Resources\InventoryResource;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Model\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function __construct(protected InventoryService $inventories) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Inventory::query()->with(['lease', 'property']);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $base->where(function ($q) use ($user) {
                $q->where('conducted_by', $user->id)
                    ->orWhereHas('property', function ($pq) use ($user) {
                        $pq->where('user_id', $user->id);
                    })
                    ->orWhereHas('tenant', function ($tq) use ($user) {
                        $tq->where('user_id', $user->id);
                    });

                if ($user->agency_id) {
                    $q->orWhereHas('property', function ($pq) use ($user) {
                        $pq->where('agency_id', $user->agency_id);
                    });
                }
            });
        }

        $paginator = Inventory::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => InventoryResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function indexForProperty(Request $request, Property $property): JsonResponse
    {
        $this->authorizePropertyAccess($request, $property);

        $base = Inventory::query()->where('property_id', $property->id);

        $paginator = Inventory::buildQuery($base, $request)
            ->defaultSort('-conducted_at')
            ->paginate();

        return $this->json([
            'data' => InventoryResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(InventoryStoreRequest $request): JsonResponse
    {
        $data = $request->validated();

        $lease = Lease::findOrFail($data['lease_id']);
        $user = $request->user();

        $this->authorizeManageLease($user, $lease);

        $inventory = $this->inventories->create($lease, $user, $data);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeAccess($request, $inventory);

        return $this->json([
            'data' => InventoryResource::make($inventory->load(['lease', 'property']))->toArray($request),
        ]);
    }

    public function update(InventoryUpdateRequest $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeManage($request, $inventory);

        // Status guard runs BEFORE validation so non-draft inventories fail
        // with a clear 422 "only draft" message instead of generic validation errors.
        abort_unless(
            $inventory->status === InventoryStatus::Draft,
            422,
            'Only draft inventories can be edited.'
        );

        $data = $request->validated();

        $presentKeys = [];
        foreach (array_keys($data) as $key) {
            if ($request->has($key)) {
                $presentKeys[$key] = true;
            }
        }

        $inventory = $this->inventories->update($inventory, $data, $presentKeys);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function submit(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeManage($request, $inventory);
        $inventory = $this->inventories->submit($inventory);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function sign(Request $request, Inventory $inventory): JsonResponse
    {
        $inventory = $this->inventories->sign($inventory, $request->user());

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function dispute(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeAccess($request, $inventory);

        $data = $request->validate([
            'reason' => ['required', 'string'],
        ]);

        $inventory = $this->inventories->dispute($inventory, $data['reason']);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function uploadRoomPhotos(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeManage($request, $inventory);

        $request->validate([
            'photos' => ['required', 'array', 'min:1'],
            'photos.*' => ['required', 'image', 'max:5120'],
            'room_name' => ['required', 'string'],
        ]);

        foreach ($request->file('photos') as $photo) {
            $inventory->addMedia($photo)
                ->withCustomProperties(['room_name' => $request->input('room_name')])
                ->toMediaCollection('room_photos');
        }

        return $this->json([
            'data' => $inventory->getMedia('room_photos')->map(fn ($m) => [
                'id' => $m->id,
                'url' => $m->getUrl(),
                'room_name' => $m->getCustomProperty('room_name'),
            ]),
        ]);
    }

    protected function authorizeManageLease($user, Lease $lease): void
    {
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $lease->landlord_id === $user->id
            || ($user->agency_id && $lease->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeAccess(Request $request, Inventory $inventory): void
    {
        $user = $request->user();
        $property = $inventory->property;
        $tenant = $inventory->tenant;

        $ok = $user->hasRole(['admin', 'super_admin'])
            || $inventory->conducted_by === $user->id
            || ($property && $property->user_id === $user->id)
            || ($tenant && $tenant->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, Inventory $inventory): void
    {
        $user = $request->user();
        $property = $inventory->property;

        $ok = $user->hasRole(['admin', 'super_admin'])
            || $inventory->conducted_by === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizePropertyAccess(Request $request, Property $property): void
    {
        $user = $request->user();

        $ok = $user->hasRole(['admin', 'super_admin'])
            || $property->user_id === $user->id
            || ($user->agency_id && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }
}
