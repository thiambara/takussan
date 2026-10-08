<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\ActivateLeaseRequest;
use App\Http\Requests\Api\AttachGuarantorLeaseRequest;
use App\Http\Requests\Api\StoreLeaseRequest;
use App\Http\Requests\Api\TerminateLeaseRequest;
use App\Http\Requests\UpdateLeaseRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Enums\LeaseStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Model\LeaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LeaseController extends Controller
{
    public function __construct(protected LeaseService $leases) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Lease::query()->with(['property.address', 'tenant']);

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('landlord_id', $user->id)
                    ->orWhereHas('tenant', fn ($t) => $t->where('user_id', $user->id));
                // TCK-587 — le périmètre d'agence est celui du PERSONNEL (ADR-0031) : un bailleur de l'agence
                // listait les ressources de tous les autres.
                if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                    $q->orWhere('agency_id', $staffAgencyId);
                }
            });
        }

        $paginator = Lease::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, LeaseResource::collection($paginator)->toArray($request));
    }

    public function store(StoreLeaseRequest $request): JsonResponse
    {
        $data = $request->validated();

        $property = Property::findOrFail($data['property_id']);
        $lease = $this->leases->create($property, $request->user(), $data);

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property', 'tenant']))->toArray($request),
        ], 201);
    }

    public function show(Request $request, Lease $lease): JsonResponse
    {
        $this->authorize('view', $lease);

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property.address', 'tenant', 'payments', 'signatures.signer', 'signatures.onBehalfOf']))
                ->forViewer($request->user())
                ->toArray($request),
        ]);
    }

    /**
     * TCK-087 — Edit lease-level late-fee configuration. Lifecycle
     * changes (status, dates, rent…) flow through their dedicated
     * actions; this endpoint is intentionally narrow.
     */
    public function update(UpdateLeaseRequest $request, Lease $lease): JsonResponse
    {
        $this->authorize('update', $lease);

        $data = $request->validated();
        // VERIF-596 M2 (ADR-0042 §1) — un terme imprimé au contrat ne bouge plus une fois le bail
        // signé : la pénalité exécutée doit rester celle que les parties ont lue. Avant la
        // signature (brouillon, attente), la modification reste possible et défige le contrat.
        abort_code_if(
            ! in_array($lease->status, [LeaseStatus::Draft, LeaseStatus::PendingSignature], true)
                && array_intersect(array_keys($data), Lease::CONTRACT_PRINTED_TERMS) !== [],
            422,
            'lease.terms_locked'
        );
        if ($data !== []) {
            $lease->fill($data)->save();
        }

        return $this->json([
            'data' => LeaseResource::make($lease->fresh())->toArray($request),
        ]);
    }

    /**
     * TCK-596 §4B (ADR-0042 §6) — la voie PAPIER : le contrat signé hors plateforme, numérisé, est
     * obligatoire et fait foi. La signature en ligne passe par `LeaseSignatureController`.
     */
    public function activate(ActivateLeaseRequest $request, Lease $lease, LeaseSignatureService $signatures): JsonResponse
    {
        $this->authorize('update', $lease);
        $lease = $signatures->signOnPaper($lease, $request->file('contract'), $request->user());

        return $this->json([
            'data' => LeaseResource::make($lease)->toArray($request),
        ]);
    }

    public function terminate(TerminateLeaseRequest $request, Lease $lease): JsonResponse
    {

        $data = $request->validated();

        $lease = $this->leases->terminate($lease, $request->user(), $data['reason'] ?? null);

        return $this->json([
            'data' => LeaseResource::make($lease)->toArray($request),
        ]);
    }

    public function generateSchedule(Request $request, Lease $lease): JsonResponse
    {
        $this->authorize('update', $lease);
        $count = $this->leases->generateSchedule($lease);

        return $this->json(['data' => ['payments_created' => $count]]);
    }

    /**
     * Attach an existing guarantor or create+attach a new one to the lease.
     * Enforces the business rule: max 3 guarantors per lease.
     */
    public function attachGuarantor(AttachGuarantorLeaseRequest $request, Lease $lease): JsonResponse
    {
        $data = $request->validated();

        if (! empty($data['guarantor_id'])) {
            $guarantor = Guarantor::findOrFail($data['guarantor_id']);
            // TCK-587 (vérification adverse, B2) — un garant hors du périmètre de l'émetteur ne se
            // rattache pas : sa fiche se lirait ensuite par `GET /api/leases/{id}/guarantors`.
            $this->authorize('view', $guarantor);
        } else {
            $guarantor = Guarantor::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'phone' => $data['phone'] ?? null,
                'email' => $data['email'] ?? null,
                'id_type' => $data['id_type'] ?? null,
                'id_number' => $data['id_number'] ?? null,
                'occupation' => $data['occupation'] ?? null,
                'employer' => $data['employer'] ?? null,
                'monthly_income' => $data['monthly_income'] ?? null,
                'relationship_to_tenant' => $data['relationship_to_tenant'] ?? null,
                'notes' => $data['notes'] ?? null,
                'added_by_id' => $request->user()->id,
            ]);
        }

        // Atomic cap check + attach: without the transaction+lock, two
        // concurrent requests can both observe count()==2 and both insert,
        // yielding 4 rows. The unique (lease_id, guarantor_id) index only
        // prevents duplicates, not the cap. lockForUpdate serializes racers
        // on the pivot rows for this lease so only one wins the cap check.
        DB::transaction(function () use ($lease, $guarantor, $data) {
            $pivotRows = $lease->guarantors()->lockForUpdate()->get(['guarantors.id']);

            abort_code_if(
                $pivotRows->contains('id', $guarantor->id),
                422,
                'lease.guarantor_already_attached'
            );

            abort_code_if(
                $pivotRows->count() >= 3,
                422,
                'lease.max_guarantors'
            );

            $lease->guarantors()->attach($guarantor->id, [
                'role' => $data['role'] ?? null,
            ]);
            // TCK-596 §4B (ADR-0042 §1) — le garant est dans le contrat : un contrat figé est défigé.
            $lease->unfreezeContract();
        });

        return $this->json([
            'data' => [
                'lease_id' => $lease->id,
                'guarantor_id' => $guarantor->id,
                'guarantors_count' => $lease->guarantors()->count(),
            ],
        ], 201);
    }

    public function detachGuarantor(Request $request, Lease $lease, Guarantor $guarantor): JsonResponse
    {
        $this->authorize('update', $lease);

        $lease->guarantors()->detach($guarantor->id);
        // TCK-596 §4B (ADR-0042 §1) — idem au retrait d'un garant.
        $lease->unfreezeContract();

        return $this->json([
            'data' => [
                'lease_id' => $lease->id,
                'guarantor_id' => $guarantor->id,
                'guarantors_count' => $lease->guarantors()->count(),
            ],
        ]);
    }

    public function listGuarantors(Request $request, Lease $lease): JsonResponse
    {
        $this->authorize('view', $lease);

        $guarantors = $lease->guarantors()->get()->map(fn (Guarantor $g) => [
            'id' => $g->id,
            'first_name' => $g->first_name,
            'last_name' => $g->last_name,
            'email' => $g->email,
            'phone' => $g->phone,
            'role' => $g->pivot->role ?? null,
        ])->values();

        return $this->json(['data' => $guarantors]);
    }
}
