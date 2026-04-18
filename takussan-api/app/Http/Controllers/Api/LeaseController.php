<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\LeaseResource;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Model\LeaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeaseController extends Controller
{
    public function __construct(protected LeaseService $leases) {}

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

    public function renew(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeManage($request, $lease);

        $data = $request->validate([
            'end_date' => ['required', 'date', 'after:'.$lease->end_date?->toDateString()],
            'monthly_rent' => ['nullable', 'numeric', 'min:0'],
            'terms' => ['nullable', 'string'],
        ]);

        $lease = $this->leases->renew($lease, $data);

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property', 'tenant']))->toArray($request),
        ], 201);
    }

    public function generateSchedule(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeManage($request, $lease);
        $count = $this->leases->generateSchedule($lease);

        return $this->json(['data' => ['payments_created' => $count]]);
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
