<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MaintenanceRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = MaintenanceRequest::query();
        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('requester_id', $user->id)
                    ->orWhere('assigned_to', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhereHas('property', fn ($p) => $p->where('agency_id', $user->agency_id));
                }
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $paginator = $query->latest()->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => MaintenanceRequestResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'property_id' => ['required', 'exists:properties,id'],
            'lease_id' => ['nullable', 'exists:leases,id'],
            'assigned_to' => ['nullable', 'exists:users,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['required', 'string'],
            'category' => ['required', Rule::enum(MaintenanceCategory::class)],
            'priority' => ['nullable', Rule::enum(MaintenancePriority::class)],
        ]);

        $user = $request->user();
        $property = Property::findOrFail($data['property_id']);

        $isStaff = $user->hasRole(['admin', 'super_admin'])
            || $property->user_id === $user->id
            || ($user->agency_id && $user->agency_id === $property->agency_id);
        $isActiveTenant = $property->leases()
            ->where('status', LeaseStatus::Active)
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $user->id))
            ->exists();
        abort_unless($isStaff || $isActiveTenant, 403);

        if (! $isStaff) {
            unset($data['assigned_to']);
        }

        $mr = MaintenanceRequest::create(array_merge($data, [
            'requester_id' => $user->id,
            'status' => MaintenanceStatus::Open->value,
        ]));

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ], 201);
    }

    public function show(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorizeAccess($request, $maintenanceRequest);

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->toArray($request),
        ]);
    }

    public function update(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorizeManage($request, $maintenanceRequest);

        $data = $request->validate([
            'assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
            'priority' => ['sometimes', Rule::enum(MaintenancePriority::class)],
            'status' => ['sometimes', Rule::enum(MaintenanceStatus::class)],
            'estimated_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'actual_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'scheduled_at' => ['sometimes', 'nullable', 'date'],
            'started_at' => ['sometimes', 'nullable', 'date'],
            'completed_at' => ['sometimes', 'nullable', 'date'],
            'resolution_notes' => ['sometimes', 'nullable', 'string'],
        ]);

        $maintenanceRequest->fill($data)->save();

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest->refresh())->toArray($request),
        ]);
    }

    protected function authorizeAccess(Request $request, MaintenanceRequest $mr): void
    {
        $user = $request->user();
        $property = $mr->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $mr->requester_id === $user->id
            || $mr->assigned_to === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, MaintenanceRequest $mr): void
    {
        $user = $request->user();
        $property = $mr->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $mr->assigned_to === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }
}
