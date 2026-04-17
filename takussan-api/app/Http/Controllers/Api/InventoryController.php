<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\InventoryResource;
use App\Models\Customer;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Inventory::query()->with(['lease', 'property']);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
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

        if ($leaseId = $request->input('lease_id')) {
            $query->where('lease_id', $leaseId);
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $paginator = $query->latest()->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => InventoryResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lease_id' => ['required', 'exists:leases,id'],
            'type' => ['required', Rule::enum(InventoryType::class)],
            'conducted_at' => ['nullable', 'date'],
            'general_condition' => ['required', Rule::enum(InventoryCondition::class)],
            'rooms' => ['required', 'array', 'min:1'],
            'rooms.*.name' => ['required', 'string'],
            'rooms.*.condition' => ['required', 'string'],
            'rooms.*.notes' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        $lease = Lease::findOrFail($data['lease_id']);
        $user = $request->user();

        $this->authorizeManageLease($user, $lease);

        $tenant = Customer::find($lease->tenant_id);
        abort_if($tenant === null, 422, 'Lease tenant not found.');

        $inventory = Inventory::create([
            'lease_id' => $lease->id,
            'property_id' => $lease->property_id,
            'type' => $data['type'],
            'conducted_by' => $user->id,
            'tenant_id' => $tenant->id,
            'conducted_at' => $data['conducted_at'] ?? now(),
            'status' => InventoryStatus::Draft->value,
            'general_condition' => $data['general_condition'],
            'rooms' => $data['rooms'],
            'notes' => $data['notes'] ?? null,
        ]);

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

    public function update(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeManage($request, $inventory);
        abort_unless(
            $inventory->status === InventoryStatus::Draft,
            422,
            'Only draft inventories can be edited.'
        );

        $data = $request->validate([
            'general_condition' => ['nullable', Rule::enum(InventoryCondition::class)],
            'rooms' => ['nullable', 'array', 'min:1'],
            'rooms.*.name' => ['required_with:rooms', 'string'],
            'rooms.*.condition' => ['required_with:rooms', 'string'],
            'rooms.*.notes' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        $inventory->update(array_filter(
            $data,
            fn ($v, $k) => $v !== null || $request->has($k),
            ARRAY_FILTER_USE_BOTH
        ));

        return $this->json([
            'data' => InventoryResource::make($inventory->refresh())->toArray($request),
        ]);
    }

    public function submit(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeManage($request, $inventory);
        abort_unless(
            $inventory->status === InventoryStatus::Draft,
            422,
            'Only draft inventories can be submitted for signature.'
        );

        $inventory->update(['status' => InventoryStatus::PendingSignature]);

        return $this->json([
            'data' => InventoryResource::make($inventory->refresh())->toArray($request),
        ]);
    }

    public function sign(Request $request, Inventory $inventory): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            in_array($inventory->status, [InventoryStatus::PendingSignature, InventoryStatus::Draft], true),
            422,
            'Inventory cannot be signed in its current state.'
        );

        $property = $inventory->property;
        $tenant = $inventory->tenant;

        $isOwner = $property && $property->user_id === $user->id;
        $isTenant = $tenant && $tenant->user_id === $user->id;
        $isAdmin = $user->hasRole(['admin', 'super_admin']);

        abort_unless($isOwner || $isTenant || $isAdmin, 403);

        $updates = [];
        if ($isOwner || $isAdmin) {
            $updates['owner_signed'] = true;
            $updates['owner_signed_at'] = now();
        }
        if ($isTenant || $isAdmin) {
            $updates['tenant_signed'] = true;
            $updates['tenant_signed_at'] = now();
        }

        $inventory->fill($updates);

        $tenantSigned = $inventory->tenant_signed;
        $ownerSigned = $inventory->owner_signed;
        if ($tenantSigned && $ownerSigned) {
            $inventory->status = InventoryStatus::Signed;
        }

        $inventory->save();

        return $this->json([
            'data' => InventoryResource::make($inventory->refresh())->toArray($request),
        ]);
    }

    public function dispute(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeAccess($request, $inventory);
        abort_unless(
            in_array($inventory->status, [InventoryStatus::PendingSignature, InventoryStatus::Signed], true),
            422,
            'Inventory cannot be disputed in its current state.'
        );

        $data = $request->validate([
            'reason' => ['required', 'string'],
        ]);

        $inventory->update([
            'status' => InventoryStatus::Disputed,
            'notes' => trim(($inventory->notes ? $inventory->notes."\n\n" : '').'[Dispute] '.$data['reason']),
        ]);

        return $this->json([
            'data' => InventoryResource::make($inventory->refresh())->toArray($request),
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
}
