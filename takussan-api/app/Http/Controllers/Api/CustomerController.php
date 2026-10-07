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
use App\Models\Enums\CustomerNoteKind;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Crm\CustomerActivityFeed;
use App\Services\Crm\CustomerDuplicateDetector;
use App\Services\Crm\PipelineStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // TCK-587 / TCK-591 §9 — la règle de `CustomerPolicy::view`, partagée avec les compteurs du
        // pipeline. Un bailleur de l'agence listait tout le CRM, téléphones et pièces d'identité compris.
        $base = Customer::query()->visibleTo($request->user());

        // TCK-281 — `defaultSortsWithRelevance()` doit être évalué APRÈS
        // `buildQuery()`, qui est ce qui interroge Meilisearch : d'où les deux
        // instructions plutôt qu'une chaîne.
        $query = Customer::buildQuery($base, $request);

        $paginator = $query
            ->defaultSorts(...Customer::defaultSortsWithRelevance('-created_at'))
            ->paginate();

        return $this->paginated($paginator, CustomerResource::collection($paginator)->toArray($request));
    }

    public function store(StoreCustomerRequest $request, CustomerDuplicateDetector $duplicates): JsonResponse
    {
        $data = $request->validated();
        $allowDuplicate = (bool) ($data['allow_duplicate'] ?? false);
        unset($data['allow_duplicate']);

        $user = $request->user();
        // TCK-591 — la fiche entre dans le CRM de l'agence où l'appelant est PERSONNEL
        // (`CustomerPolicy::create` l'a établi ; `null` pour le super-admin hors agence).
        $agencyId = $user->staffAgencyId();

        if (! $allowDuplicate && ($response = $this->duplicateResponse($duplicates, $agencyId, $data, $user)) !== null) {
            return $response;
        }

        $customer = Customer::create(array_merge($data, [
            'added_by_id' => $user->id,
            'agency_id' => $agencyId,
            'status' => CustomerStatus::Active->value,
            'pipeline_stage' => $data['pipeline_stage'] ?? CustomerPipelineStage::Lead->value,
        ]));

        return $this->json([
            'data' => CustomerResource::make($customer)->toArray($request),
        ], 201);
    }

    /**
     * TCK-591 — un client de la même agence au même téléphone normalisé ou au même e-mail replié :
     * 409 `customer_duplicate` avec les fiches trouvées, que le front présente comme une aide
     * (« ouvrir sa fiche » / « créer quand même » → `allow_duplicate=true`).
     *
     * @param  array<string, mixed>  $data
     */
    private function duplicateResponse(
        CustomerDuplicateDetector $duplicates,
        ?int $agencyId,
        array $data,
        User $user,
        ?Customer $current = null,
    ): ?JsonResponse {
        $phone = array_key_exists('phone', $data) ? $data['phone'] : null;
        $email = array_key_exists('email', $data) ? $data['email'] : null;
        if ($current !== null) {
            // À la mise à jour, seul un champ qui CHANGE peut créer un doublon.
            $phone = $phone !== null && $phone !== $current->phone ? $phone : null;
            $email = $email !== null && $email !== $current->email ? $email : null;
        }

        $existing = $duplicates->find($agencyId, $phone, $email, $user, $current?->id);
        if ($existing === []) {
            return null;
        }

        return $this->json([
            'code' => 'customer_duplicate',
            'message' => __('crm.customers.duplicate'),
            'existing' => $existing,
        ], 409);
    }

    public function show(Request $request, Customer $customer): JsonResponse
    {
        $this->authorize('view', $customer);

        // Re-fetch through the query builder so ?include= params (e.g. tags) are honoured.
        $customer = Customer::buildQuery(Customer::where('id', $customer->id), $request)->firstOrFail();

        return $this->json([
            'data' => CustomerResource::make($customer)->toArray($request),
        ]);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer, CustomerDuplicateDetector $duplicates): JsonResponse
    {
        $data = $request->validated();

        $reason = $data['reason'] ?? null;
        $allowDuplicate = (bool) ($data['allow_duplicate'] ?? false);
        unset($data['reason'], $data['allow_duplicate']);

        if (! $allowDuplicate
            && ($response = $this->duplicateResponse($duplicates, $customer->agency_id, $data, $request->user(), $customer)) !== null) {
            return $response;
        }

        $oldStage = $customer->pipeline_stage;
        $customer->fill($data)->save();

        if (array_key_exists('pipeline_stage', $data)) {
            $newStage = $customer->pipeline_stage;
            $isTerminal = $newStage === CustomerPipelineStage::Converted
                || $newStage === CustomerPipelineStage::Lost;
            if ($isTerminal && $newStage !== $oldStage && $reason !== null && trim($reason) !== '') {
                $this->pinStageNote($customer, $newStage, $reason, $request->user());
            }
        }

        return $this->json([
            'data' => CustomerResource::make($customer->refresh())->toArray($request),
        ]);
    }

    public function destroy(Request $request, Customer $customer): JsonResponse
    {
        $this->authorize('delete', $customer);

        $customer->delete();

        return $this->json(['message' => 'deleted'], 204);
    }

    public function setPrimaryContact(SetPrimaryContactCustomerRequest $request, Customer $customer): JsonResponse
    {

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
        $this->authorize('view', $customer);

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

        $data = $request->validated();

        $oldStage = $customer->pipeline_stage;
        $customer->update(['pipeline_stage' => $data['pipeline_stage']]);

        $newStage = $customer->pipeline_stage;
        $isTerminal = $newStage === CustomerPipelineStage::Converted
            || $newStage === CustomerPipelineStage::Lost;
        $reason = $data['reason'] ?? null;
        if ($isTerminal && $newStage !== $oldStage && $reason !== null && trim($reason) !== '') {
            $this->pinStageNote($customer, $newStage, $reason, $request->user());
        }

        return $this->json([
            'data' => CustomerResource::make($customer->refresh())->toArray($request),
        ]);
    }

    /**
     * TCK-591 — la note épinglée d'un passage en « converti » / « perdu » porte sa NATURE
     * (`kind`) et le seul motif saisi. Le préfixe était écrit en français dans le corps même de
     * la note : un agent anglophone le lisait en français. Il se rend désormais côté front, dans
     * la langue du lecteur.
     */
    private function pinStageNote(Customer $customer, CustomerPipelineStage $stage, string $reason, User $author): void
    {
        CustomerNote::create([
            'customer_id' => $customer->id,
            'author_id' => $author->id,
            'kind' => $stage === CustomerPipelineStage::Converted
                ? CustomerNoteKind::Conversion
                : CustomerNoteKind::Loss,
            'body' => trim($reason),
            'pinned' => true,
        ]);
    }

    /**
     * TCK-591 — le journal de la fiche : le client, ses notes, ses tâches. Autorisé par la
     * lecture du client, et non plus par `/api/audit-log` (réservé aux admins : l'onglet
     * « Activité » était vide en silence pour un agent).
     */
    public function activity(Request $request, Customer $customer, CustomerActivityFeed $feed): JsonResponse
    {
        $this->authorize('view', $customer);

        $paginator = $feed->paginate($customer, (int) $request->input('per_page', 20));

        return $this->paginated(
            $paginator,
            $paginator->getCollection()->map(fn ($log) => $feed->format($log))->values()->all(),
        );
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
}
