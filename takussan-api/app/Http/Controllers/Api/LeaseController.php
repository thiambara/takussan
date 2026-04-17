<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\LeaseResource;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LeaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Lease::query()->with(['property.address', 'tenant']);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('landlord_id', $user->id);
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
            'type' => ['required', 'string'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after:start_date'],
            'monthly_rent' => ['nullable', 'numeric', 'min:0'],
            'sale_price' => ['nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'payment_frequency' => ['nullable', 'string'],
            'payment_day' => ['nullable', 'integer', 'between:1,28'],
            'currency' => ['nullable', 'string', 'size:3'],
            'terms' => ['nullable', 'string'],
        ]);

        $user = $request->user();

        $lease = Lease::create(array_merge($data, [
            'reference_number' => 'LS-'.strtoupper(Str::random(8)),
            'landlord_id' => $user->id,
            'agency_id' => $user->agency_id,
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
        return $this->json([
            'data' => LeaseResource::make($lease->load(['property.address', 'tenant', 'payments']))->toArray($request),
        ]);
    }

    public function activate(Request $request, Lease $lease): JsonResponse
    {
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
}
