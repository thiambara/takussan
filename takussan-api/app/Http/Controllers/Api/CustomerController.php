<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
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
use App\Models\Lease;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Crm\CustomerActivityFeed;
use App\Services\Crm\CustomerDuplicateDetector;
use App\Services\Crm\PipelineStatsService;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

        // TCK-2054 (ADR-0073) — la détection et la création dans une même transaction, sous le
        // verrou consultatif de la fiche : deux créations simultanées du même client ne passent
        // plus toutes deux le détecteur. `allow_duplicate` saute la sonde, pas le verrou.
        $customer = DB::transaction(function () use ($duplicates, $agencyId, $data, $user, $allowDuplicate): Customer {
            CustomerDuplicateDetector::lockCreation($agencyId, $data['phone'] ?? null, $data['email'] ?? null);

            if (! $allowDuplicate) {
                $this->refuseDuplicate($duplicates, $agencyId, $data, $user);
            }

            return Customer::create(array_merge($data, [
                'added_by_id' => $user->id,
                'agency_id' => $agencyId,
                'status' => CustomerStatus::Active->value,
                'pipeline_stage' => $data['pipeline_stage'] ?? CustomerPipelineStage::Lead->value,
            ]));
        });

        // TCK-953 — relue en entier : le masque de la pièce se calcule même si elle n'a pas été saisie.
        return $this->json([
            'data' => CustomerResource::make($customer->refresh())->resolve($request),
        ], 201);
    }

    /**
     * TCK-591 — un client de la même agence au même téléphone normalisé ou au même e-mail replié :
     * 409 `customer.duplicate` avec les fiches trouvées (`existing`), que le front présente comme une aide
     * (« ouvrir sa fiche » / « créer quand même » → `allow_duplicate=true`).
     *
     * @param  array<string, mixed>  $data
     */
    private function refuseDuplicate(
        CustomerDuplicateDetector $duplicates,
        ?int $agencyId,
        array $data,
        User $user,
        ?Customer $current = null,
    ): void {
        // TCK-591 (verif-591 m1) — la détection sonde tout le CRM de l'agence : réservée à son
        // personnel. Un bailleur auteur d'une fiche s'en servait d'oracle (409 sur un numéro présent).
        if ($agencyId !== null && ! $user->isSuperAdmin()
            && ! app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId)) {
            return;
        }

        $phone = array_key_exists('phone', $data) ? $data['phone'] : null;
        $email = array_key_exists('email', $data) ? $data['email'] : null;
        if ($current !== null) {
            // À la mise à jour, seul un champ qui CHANGE peut créer un doublon.
            $phone = $phone !== null && $phone !== $current->phone ? $phone : null;
            $email = $email !== null && $email !== $current->email ? $email : null;
        }

        $existing = $duplicates->find($agencyId, $phone, $email, $user, $current?->id);
        if ($existing === []) {
            return;
        }

        throw (new ApiError(409, 'customer.duplicate'))->with(['existing' => $existing]);
    }

    public function show(Request $request, Customer $customer): JsonResponse
    {
        $this->authorize('view', $customer);

        // Re-fetch through the query builder so ?include= params (e.g. tags) are honoured.
        $query = Customer::buildQuery(Customer::where('id', $customer->id), $request);
        // TCK-953 (ADR-0070 § 3) — `id_number` n'est plus demandable par `fields[customers]` : il est
        // chargé ici pour que la ressource en calcule le MASQUE. Sans `fields[]`, `select *` le charge.
        if ($query->getQuery()->columns !== null) {
            $query->addSelect(array_map(static fn (string $column): string => 'customers.'.$column, Customer::SENSITIVE));
        }
        $customer = $query->firstOrFail();

        return $this->json([
            'data' => CustomerResource::make($customer)->resolve($request),
        ]);
    }

    /**
     * TCK-955 (ADR-0070 § 5) — le numéro de pièce EN CLAIR. La garde de step-up a déjà répondu
     * (`ProtectedActions::STEP_UP`), l'impersonation aussi (`EnforceImpersonationReadOnly`) ; la
     * consultation est journalisée APRÈS l'autorisation, rattachée à l'agence du client.
     */
    public function sensitive(Request $request, Customer $customer, PersonalDataAccessLogger $accessLog): JsonResponse
    {
        $this->authorize('viewSensitive', $customer);

        $accessLog->record($request->user(), $customer, PersonalDataAccessLogger::SURFACE_CUSTOMER_SENSITIVE);

        return $this->json([
            'data' => [
                'id' => $customer->id,
                'id_type' => $customer->id_type?->value,
                'id_number' => $customer->id_number,
            ],
        ]);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer, CustomerDuplicateDetector $duplicates): JsonResponse
    {
        $data = $request->validated();

        $reason = $data['reason'] ?? null;
        $allowDuplicate = (bool) ($data['allow_duplicate'] ?? false);
        unset($data['reason'], $data['allow_duplicate']);

        if (! $allowDuplicate) {
            $this->refuseDuplicate($duplicates, $customer->agency_id, $data, $request->user(), $customer);
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
            'data' => CustomerResource::make($customer->refresh())->resolve($request),
        ]);
    }

    public function destroy(Request $request, Customer $customer): JsonResponse
    {
        $this->authorize('delete', $customer);

        // P130.05 (TCK-1332) — même forme que le garant (VERIF-596) : une fiche que porte un bail
        // en attente de signature ou en cours ne se supprime pas. Supprimée, elle laissait le bail
        // courir sans locataire — relances vers personne, pénalités qui s'appliquent — et le
        // locataire à compte perdait l'accès à son bail, ses quittances et ses factures.
        abort_code_if(
            // P162.03 (TCK-1716) — préavis compris.
            $customer->leases()->whereIn('status', Lease::OPEN_STATUSES)->exists(),
            422,
            'customer.attached_to_open_lease',
        );

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

        // TCK-1500 (P94.04) — `started_at` et `ended_at` sont castés `date` : ils sortent en
        // `Y-m-d` (ADR-0018), et non en instant de minuit comme le rendait le modèle brut.
        return $this->json(['data' => array_merge($relationship->toArray(), [
            'started_at' => $relationship->started_at?->toDateString(),
            'ended_at' => $relationship->ended_at?->toDateString(),
        ])]);
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
            'data' => CustomerResource::make($customer->refresh())->resolve($request),
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

        $paginator = $feed->paginate($customer, $this->tailleDePage($request, 20));

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
