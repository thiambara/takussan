<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Customer::query();

        if (! $user->hasRole(['admin', 'super_admin'])) {
            if ($user->agency_id) {
                $query->where('agency_id', $user->agency_id);
            } else {
                $query->where('added_by_id', $user->id);
            }
        }

        if ($stage = $request->input('pipeline_stage')) {
            $query->where('pipeline_stage', $stage);
        }
        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%$search%")
                    ->orWhere('last_name', 'like', "%$search%")
                    ->orWhere('email', 'like', "%$search%")
                    ->orWhere('phone', 'like', "%$search%");
            });
        }

        $paginator = $query->latest()->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => CustomerResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string'],
            'last_name' => ['required', 'string'],
            'email' => ['nullable', 'email'],
            'phone' => ['nullable', 'string'],
            'id_type' => ['nullable', 'string'],
            'id_number' => ['nullable', 'string'],
            'occupation' => ['nullable', 'string'],
            'pipeline_stage' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        $user = $request->user();
        $customer = Customer::create(array_merge($data, [
            'added_by_id' => $user->id,
            'agency_id' => $user->agency_id,
            'status' => CustomerStatus::Active->value,
            'pipeline_stage' => $data['pipeline_stage'] ?? CustomerPipelineStage::Lead->value,
        ]));

        return $this->json([
            'data' => CustomerResource::make($customer)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Customer $customer): JsonResponse
    {
        return $this->json([
            'data' => CustomerResource::make($customer)->toArray($request),
        ]);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['sometimes', 'string'],
            'last_name' => ['sometimes', 'string'],
            'email' => ['sometimes', 'nullable', 'email'],
            'phone' => ['sometimes', 'nullable', 'string'],
            'id_type' => ['sometimes', 'nullable', 'string'],
            'id_number' => ['sometimes', 'nullable', 'string'],
            'occupation' => ['sometimes', 'nullable', 'string'],
            'pipeline_stage' => ['sometimes', 'string'],
            'status' => ['sometimes', 'string'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        $customer->fill($data)->save();

        return $this->json([
            'data' => CustomerResource::make($customer->refresh())->toArray($request),
        ]);
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $customer->delete();

        return $this->json(['message' => 'deleted'], 204);
    }
}
