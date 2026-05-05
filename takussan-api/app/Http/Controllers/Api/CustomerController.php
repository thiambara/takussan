<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\IdType;
use App\Models\UserCustomerRelationship;
use App\Services\Crm\PipelineStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = Customer::query();

        if (! $user->hasRole(['admin', 'super_admin'])) {
            if ($user->agency_id) {
                $base->where('agency_id', $user->agency_id);
            } else {
                $base->where('added_by_id', $user->id);
            }
        }

        $paginator = Customer::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => CustomerResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
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

        // Re-fetch through the query builder so ?include= params (e.g. tags) are honoured.
        $customer = Customer::buildQuery(Customer::where('id', $customer->id), $request)->firstOrFail();

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
            // TCK-083 — optional reason captured when transitioning to a
            // terminal stage (`converted`/`lost`). Persisted as a CustomerNote.
            'reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);

        $reason = $data['reason'] ?? null;
        unset($data['reason']);

        $oldStage = $customer->pipeline_stage;
        $customer->fill($data)->save();

        if (array_key_exists('pipeline_stage', $data)) {
            $newStage = $customer->pipeline_stage;
            $isTerminal = $newStage === CustomerPipelineStage::Converted
                || $newStage === CustomerPipelineStage::Lost;
            if ($isTerminal && $newStage !== $oldStage && $reason !== null && trim($reason) !== '') {
                CustomerNote::create([
                    'customer_id' => $customer->id,
                    'author_id' => $request->user()->id,
                    'body' => __($newStage === CustomerPipelineStage::Converted
                        ? 'Conversion : '
                        : 'Perte : ').$reason,
                    'pinned' => true,
                ]);
            }
        }

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

        $relationship = UserCustomerRelationship::firstOrCreate(
            [
                'customer_id' => $customer->id,
                'user_id' => $data['user_id'],
                'relationship_type' => 'agent_client',
            ],
        );

        $relationship->update(['is_primary' => true]);

        return $this->json(['data' => $relationship]);
    }

    public function updatePipelineStage(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $data = $request->validate([
            'pipeline_stage' => ['required', Rule::enum(CustomerPipelineStage::class)],
            'reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);

        $oldStage = $customer->pipeline_stage;
        $customer->update(['pipeline_stage' => $data['pipeline_stage']]);

        $newStage = $customer->pipeline_stage;
        $isTerminal = $newStage === CustomerPipelineStage::Converted
            || $newStage === CustomerPipelineStage::Lost;
        $reason = $data['reason'] ?? null;
        if ($isTerminal && $newStage !== $oldStage && $reason !== null && trim($reason) !== '') {
            CustomerNote::create([
                'customer_id' => $customer->id,
                'author_id' => $request->user()->id,
                'body' => ($newStage === CustomerPipelineStage::Converted
                    ? 'Conversion : '
                    : 'Perte : ').$reason,
                'pinned' => true,
            ]);
        }

        return $this->json([
            'data' => CustomerResource::make($customer->refresh())->toArray($request),
        ]);
    }

    /**
     * TCK-083 — pipeline metrics for the kanban top bar.
     * Returns 4 metrics scoped to the agent / agency.
     */
    public function pipelineStats(Request $request, PipelineStatsService $service): JsonResponse
    {
        return $this->json([
            'data' => $service->compute($request->user()),
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
