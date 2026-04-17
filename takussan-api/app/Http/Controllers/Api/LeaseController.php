<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\LeaseResource;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Lease;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class LeaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Lease::query()->with(['property.address', 'tenant']);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('landlord_id', $user->id)
                    ->orWhereHas('tenant', fn ($t) => $t->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $paginator = $query->latest()->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => LeaseResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'property_id' => ['required', 'exists:properties,id'],
            'tenant_id' => ['required', 'exists:customers,id'],
            'booking_id' => ['nullable', 'exists:bookings,id'],
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

        $user = $request->user();
        $property = Property::findOrFail($data['property_id']);

        $canCreate = $user->hasRole(['admin', 'super_admin'])
            || $property->user_id === $user->id
            || ($user->agency_id && $property->agency_id === $user->agency_id);
        abort_unless($canCreate, 403);

        $lease = Lease::create(array_merge($data, [
            'reference_number' => 'LS-'.strtoupper(Str::random(8)),
            'landlord_id' => $property->user_id,
            'agency_id' => $property->agency_id ?? $user->agency_id,
            'status' => LeaseStatus::Draft->value,
            'currency' => $data['currency'] ?? 'XOF',
            'payment_frequency' => $data['payment_frequency'] ?? 'monthly',
        ]));

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

    public function activate(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeManage($request, $lease);
        abort_unless($lease->status === LeaseStatus::Draft, 422, 'Only draft leases can be activated.');

        $lease->update([
            'status' => LeaseStatus::Active,
            'signed_at' => now(),
        ]);

        return $this->json([
            'data' => LeaseResource::make($lease->refresh())->toArray($request),
        ]);
    }

    public function terminate(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeManage($request, $lease);
        abort_unless(
            in_array($lease->status, [LeaseStatus::Active, LeaseStatus::PendingSignature], true),
            422,
            'Only active or pending-signature leases can be terminated.'
        );

        $data = $request->validate([
            'reason' => ['nullable', 'string'],
        ]);

        $lease->update([
            'status' => LeaseStatus::Terminated,
            'terminated_at' => now(),
            'terminated_by_id' => $request->user()->id,
            'termination_reason' => $data['reason'] ?? null,
        ]);

        return $this->json([
            'data' => LeaseResource::make($lease->refresh())->toArray($request),
        ]);
    }

    protected function authorizeAccess(Request $request, Lease $lease): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $lease->landlord_id === $user->id
            || ($user->agency_id && $user->agency_id === $lease->agency_id)
            || ($lease->tenant && $lease->tenant->user_id === $user->id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, Lease $lease): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $lease->landlord_id === $user->id
            || ($user->agency_id && $user->agency_id === $lease->agency_id);

        abort_unless($ok, 403);
    }
}
