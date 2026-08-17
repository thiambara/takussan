<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\UpdateLeaseRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Enums\Currency;
use App\Models\Enums\IdType;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
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

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'property_id' => ['required', 'exists:properties,id'],
            'tenant_id' => ['required', 'exists:customers,id'],
            'booking_id' => ['nullable', Rule::exists('bookings', 'id')->where('property_id', $request->input('property_id'))],
            'guarantor_id' => ['nullable', 'exists:guarantors,id'],
            'type' => ['required', Rule::enum(LeaseType::class)],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after:start_date'],
            'monthly_rent' => ['nullable', 'numeric', 'min:0'],
            'sale_price' => ['nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'payment_frequency' => ['nullable', Rule::enum(PaymentFrequency::class)],
            'payment_day' => ['nullable', 'integer', 'between:1,28'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'terms' => ['nullable', 'string'],
        ]);

        $property = Property::findOrFail($data['property_id']);
        $lease = $this->leases->create($property, $request->user(), $data);

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property', 'tenant']))->toArray($request),
        ], 201);
    }

    public function show(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeAccess($request, $lease);

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
        $this->authorizeManage($request, $lease);

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
        $this->authorizeManage($request, $lease);
        $lease = $this->leases->activate($lease);

        return $this->json([
            'data' => LeaseResource::make($lease)->toArray($request),
        ]);
    }

    public function terminate(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeManage($request, $lease);

        $data = $request->validate([
            'reason' => ['nullable', 'string'],
        ]);

        $lease = $this->leases->terminate($lease, $request->user(), $data['reason'] ?? null);

        return $this->json([
            'data' => LeaseResource::make($lease)->toArray($request),
        ]);
    }

    public function generateSchedule(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeManage($request, $lease);
        $count = $this->leases->generateSchedule($lease);

        return $this->json(['data' => ['payments_created' => $count]]);
    }

    /**
     * Attach an existing guarantor or create+attach a new one to the lease.
     * Enforces the business rule: max 3 guarantors per lease.
     */
    public function attachGuarantor(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeManage($request, $lease);

        $data = $request->validate([
            'guarantor_id' => ['nullable', 'exists:guarantors,id'],
            'role' => ['nullable', 'string', 'max:50'],
            'first_name' => ['required_without:guarantor_id', 'string'],
            'last_name' => ['required_without:guarantor_id', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'id_type' => ['nullable', Rule::enum(IdType::class)],
            'id_number' => ['nullable', 'string'],
            'occupation' => ['nullable', 'string'],
            'employer' => ['nullable', 'string'],
            'monthly_income' => ['nullable', 'numeric', 'min:0'],
            'relationship_to_tenant' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

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
        $this->authorizeManage($request, $lease);

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
        $this->authorizeAccess($request, $lease);

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

    protected function authorizeAccess(Request $request, Lease $lease): void
    {
        $user = $request->user();
        $ok = $user->isSuperAdmin()
            || $lease->landlord_id === $user->id
            || ($user->agency_id && $user->agency_id === $lease->agency_id)
            || ($lease->tenant && $lease->tenant->user_id === $user->id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, Lease $lease): void
    {
        $user = $request->user();
        $ok = $user->isSuperAdmin()
            || $lease->landlord_id === $user->id
            || ($user->agency_id && $user->agency_id === $lease->agency_id);

        abort_unless($ok, 403);
    }
}
