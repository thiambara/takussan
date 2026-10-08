<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\PayServiceProviderBillRequest;
use App\Http\Requests\Api\RejectServiceProviderBillRequest;
use App\Http\Requests\Api\ValidateServiceProviderBillRequest;
use App\Http\Resources\PayoutResource;
use App\Http\Resources\ServiceProviderBillResource;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\ServiceProviderBill;
use App\Services\Model\PayoutService;
use App\Support\SegregationOfDuties;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §8) — les factures d'intervention. Le prestataire lit les siennes ; le
 * personnel de l'agence lit celles de l'agence. Une facture hors de ce périmètre rend 404.
 */
class ServiceProviderBillController extends Controller
{
    public function __construct(private readonly PayoutService $payouts) {}

    public function index(Request $request): JsonResponse
    {
        $bills = ServiceProviderBill::buildQuery(baseQuery: $this->visibleTo($request), request: $request)
            ->defaultSort('-created_at')
            ->paginate($request->integer('per_page', 20));

        return $this->paginated($bills, ServiceProviderBillResource::collection($bills->items())->resolve($request));
    }

    public function show(Request $request, int $bill): JsonResponse
    {
        $found = $this->visibleTo($request)->whereKey($bill)->firstOrFail();

        return $this->json(['data' => ServiceProviderBillResource::make($found)->resolve($request)]);
    }

    public function validateBill(ValidateServiceProviderBillRequest $request, ServiceProviderBill $serviceProviderBill): JsonResponse
    {
        $bill = $this->decide($serviceProviderBill, $request, function (ServiceProviderBill $locked) use ($request): array {
            return array_merge($request->validated(), [
                'status' => ServiceProviderBillStatus::Validated,
                'validated_by_id' => $request->user()->id,
                'validated_at' => now(),
            ]);
        });

        return $this->json(['data' => ServiceProviderBillResource::make($bill)->resolve($request)]);
    }

    public function reject(RejectServiceProviderBillRequest $request, ServiceProviderBill $serviceProviderBill): JsonResponse
    {
        $bill = $this->decide($serviceProviderBill, $request, fn (): array => [
            'status' => ServiceProviderBillStatus::Rejected,
            'rejection_reason' => $request->string('rejection_reason')->toString(),
            'validated_by_id' => $request->user()->id,
            'validated_at' => now(),
        ]);

        return $this->json(['data' => ServiceProviderBillResource::make($bill)->resolve($request)]);
    }

    public function pay(PayServiceProviderBillRequest $request, ServiceProviderBill $serviceProviderBill): JsonResponse
    {
        $payout = $this->payouts->createForBill($request->user(), $serviceProviderBill, $request->validated());

        return $this->json(['data' => PayoutResource::make($payout)->resolve($request)], 201);
    }

    /**
     * Valider ou rejeter : depuis `pending_validation` seulement, sous verrou, jamais par le
     * prestataire de la facture.
     *
     * @param  callable(ServiceProviderBill): array<string, mixed>  $changes
     */
    private function decide(ServiceProviderBill $bill, Request $request, callable $changes): ServiceProviderBill
    {
        SegregationOfDuties::assertDistinct($request->user(), [$bill->provider_id], SegregationOfDuties::STEP_APPROVE);

        return DB::transaction(function () use ($bill, $changes): ServiceProviderBill {
            $locked = ServiceProviderBill::query()->whereKey($bill->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->status === ServiceProviderBillStatus::PendingValidation, 422, 'service_provider_bill.not_pending');
            $locked->update($changes($locked));

            return $locked->refresh();
        });
    }

    /** @return Builder<ServiceProviderBill> */
    private function visibleTo(Request $request): Builder
    {
        $user = $request->user();
        $query = ServiceProviderBill::query();

        if ($user->isSuperAdmin()) {
            return $query;
        }

        $staffAgencyId = $user->staffAgencyId();

        return $query->where(function (Builder $q) use ($user, $staffAgencyId): void {
            $q->where('provider_id', $user->id);
            if ($staffAgencyId !== null) {
                $q->orWhere('agency_id', $staffAgencyId);
            }
        });
    }
}
