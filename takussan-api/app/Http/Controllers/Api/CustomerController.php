<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\IdType;
use App\Models\UserCustomerRelationship;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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
            'id_type' => ['nullable', Rule::enum(IdType::class)],
            'id_number' => ['nullable', 'string'],
            'occupation' => ['nullable', 'string'],
            'pipeline_stage' => ['nullable', Rule::enum(CustomerPipelineStage::class)],
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
        $this->authorizeAccess($request, $customer);

        return $this->json([
            'data' => CustomerResource::make($customer)->toArray($request),
        ]);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $data = $request->validate([
            'first_name' => ['sometimes', 'string'],
            'last_name' => ['sometimes', 'string'],
            'email' => ['sometimes', 'nullable', 'email'],
            'phone' => ['sometimes', 'nullable', 'string'],
            'id_type' => ['sometimes', 'nullable', Rule::enum(IdType::class)],
            'id_number' => ['sometimes', 'nullable', 'string'],
            'occupation' => ['sometimes', 'nullable', 'string'],
            'pipeline_stage' => ['sometimes', Rule::enum(CustomerPipelineStage::class)],
            'status' => ['sometimes', Rule::enum(CustomerStatus::class)],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        $customer->fill($data)->save();

        return $this->json([
            'data' => CustomerResource::make($customer->refresh())->toArray($request),
        ]);
    }

    public function destroy(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $customer->delete();

        return $this->json(['message' => 'deleted'], 204);
    }

    public function setPrimaryContact(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
        ]);

        // Remove existing primary
        UserCustomerRelationship::where('customer_id', $customer->id)
            ->where('is_primary', true)
            ->update(['is_primary' => false]);

        $relationship = UserCustomerRelationship::firstOrCreate([
            'customer_id' => $customer->id,
            'user_id' => $data['user_id'],
        ]);

        $relationship->update(['is_primary' => true]);

        return $this->json(['data' => $relationship]);
    }

    public function updatePipelineStage(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $data = $request->validate([
            'pipeline_stage' => ['required', Rule::enum(CustomerPipelineStage::class)],
        ]);

        $customer->update(['pipeline_stage' => $data['pipeline_stage']]);

        return $this->json([
            'data' => CustomerResource::make($customer->refresh())->toArray($request),
        ]);
    }

    protected function authorizeAccess(Request $request, Customer $customer): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $customer->added_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $customer->agency_id);

        abort_unless($ok, 403);
    }
}
