<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\AttachGuarantorLeaseRequest;
use App\Http\Requests\Api\StoreLeaseRequest;
use App\Http\Requests\Api\TerminateLeaseRequest;
use App\Http\Requests\UpdateLeaseRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
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
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
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
            'data' => LeaseResource::make($lease->load(['property.address', 'tenant', 'payments']))->toArray($request),
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
        if ($data !== []) {
            $lease->fill($data)->save();
        }

        return $this->json([
            'data' => LeaseResource::make($lease->fresh())->toArray($request),
        ]);
    }

    public function activate(Request $request, Lease $lease): JsonResponse
    {
        $this->authorize('update', $lease);
        $lease = $this->leases->activate($lease);

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

            abort_if(
                $pivotRows->contains('id', $guarantor->id),
                422,
                'Guarantor already attached to this lease.'
            );

            abort_if(
                $pivotRows->count() >= 3,
                422,
                __('validation.max_guarantors_reached')
            );

            $lease->guarantors()->attach($guarantor->id, [
                'role' => $data['role'] ?? null,
            ]);
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
