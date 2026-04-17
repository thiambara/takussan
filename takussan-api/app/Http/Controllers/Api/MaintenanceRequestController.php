<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaintenanceRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = MaintenanceRequest::query();
        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('requester_id', $user->id)
                    ->orWhere('assigned_to', $user->id);
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
            'category' => ['required', 'string'],
            'priority' => ['nullable', 'string'],
        ]);

        $mr = MaintenanceRequest::create(array_merge($data, [
            'requester_id' => $request->user()->id,
            'status' => MaintenanceStatus::Open->value,
        ]));

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ], 201);
    }

    public function show(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->toArray($request),
        ]);
    }

    public function update(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $data = $request->validate([
            'assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
            'priority' => ['sometimes', 'string'],
            'status' => ['sometimes', 'string'],
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
}
