<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\SetPrimaryContactCustomerRequest;
use App\Http\Requests\Api\StoreCustomerRequest;
use App\Http\Requests\Api\UpdateCustomerRequest;
use App\Http\Requests\Api\UpdatePipelineStageCustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\UserCustomerRelationship;
use App\Services\Crm\PipelineStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = Customer::query();

        if (! $user->isSuperAdmin()) {
            if ($user->agency_id) {
                $base->where(function ($query) use ($user) {
                    $query
                        ->where('agency_id', $user->agency_id)
                        ->orWhere('added_by_id', $user->id);
                });
            } else {
                $base->where('added_by_id', $user->id);
            }
        }

        // TCK-281 — `defaultSortsWithRelevance()` doit être évalué APRÈS
        // `buildQuery()`, qui est ce qui interroge Meilisearch : d'où les deux
        // instructions plutôt qu'une chaîne.
        $query = Customer::buildQuery($base, $request);

        $paginator = $query
            ->defaultSorts(...Customer::defaultSortsWithRelevance('-created_at'))
            ->paginate();

        return $this->paginated($paginator, CustomerResource::collection($paginator)->toArray($request));
    }

    public function store(StoreCustomerRequest $request): JsonResponse
    {
        $data = $request->validated();

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

    public function update(UpdateCustomerRequest $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $data = $request->validated();

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

    public function setPrimaryContact(SetPrimaryContactCustomerRequest $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $data = $request->validated();

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

    public function relationships(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $relationships = $customer->relationships()
            ->with('user:id,first_name,last_name,email')
            ->latest('started_at')
            ->get()
            ->map(fn (UserCustomerRelationship $relationship) => [
                'id' => $relationship->id,
                'user_id' => $relationship->user_id,
                'customer_id' => $relationship->customer_id,
                'relationship_type' => $relationship->relationship_type?->value,
                'is_primary' => $relationship->is_primary,
                'status' => $relationship->status?->value,
                'start_date' => $relationship->started_at?->toDateString(),
                'end_date' => $relationship->ended_at?->toDateString(),
                'notes' => $relationship->notes,
                'user' => $relationship->relationLoaded('user') && $relationship->user
                    ? [
                        'id' => $relationship->user->id,
                        'name' => $relationship->user->getFullNameAttribute(),
                        'email' => $relationship->user->email,
                    ]
                    : null,
            ])
            ->values();

        return $this->json(['data' => $relationships]);
    }

    public function updatePipelineStage(UpdatePipelineStageCustomerRequest $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $data = $request->validated();

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
        $ok = $user->isSuperAdmin()
            || $customer->added_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $customer->agency_id);

        abort_unless($ok, 403);
    }
}
