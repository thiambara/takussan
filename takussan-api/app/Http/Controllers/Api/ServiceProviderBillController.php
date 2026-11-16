<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\PayServiceProviderBillRequest;
use App\Http\Requests\Api\RejectServiceProviderBillRequest;
use App\Http\Requests\Api\SubmitServiceProviderBillRequest;
use App\Http\Requests\Api\ValidateServiceProviderBillRequest;
use App\Http\Resources\PayoutResource;
use App\Http\Resources\ServiceProviderBillResource;
use App\Models\Enums\Currency;
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
            ->paginate($this->tailleDePage($request, 20));

        return $this->paginated($bills, ServiceProviderBillResource::collection($bills->items())->resolve($request));
    }

    public function show(Request $request, int $bill): JsonResponse
    {
        $found = $this->visibleTo($request)->whereKey($bill)->firstOrFail();
        $found->load('media');

        return $this->json(['data' => ServiceProviderBillResource::make($found)->resolve($request)]);
    }

    /**
     * TCK-2911 (ADR-0120 § 1) — « Facturer » : le prestataire envoie son brouillon. Sous verrou :
     * depuis `draft` seulement, et pour un travail encore rendu (TCK-2270). Le montant final s'arrondit
     * à l'unité de la devise, comme à la naissance de la facture (VERIF-594 m-3), et `exceeds_quote`
     * se relit contre le devis approuvé.
     */
    public function submit(SubmitServiceProviderBillRequest $request, ServiceProviderBill $serviceProviderBill): JsonResponse
    {
        $bill = DB::transaction(function () use ($request, $serviceProviderBill): ServiceProviderBill {
            $locked = ServiceProviderBill::query()->whereKey($serviceProviderBill->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->status === ServiceProviderBillStatus::Draft, 422, 'service_provider_bill.not_draft');
            abort_code_unless($locked->requestIsBillable(), 422, 'service_provider_bill.request_not_completed');

            $amount = $request->filled('amount')
                ? Currency::roundAmount((float) $request->input('amount'), $locked->currency ?? Currency::XOF)
                : (float) $locked->amount;
            $quote = $this->approvedQuote($locked);

            $locked->forceFill([
                'amount' => $amount,
                'exceeds_quote' => $quote > 0 && $amount > $quote,
                'provider_reference' => $request->filled('provider_reference')
                    ? $request->string('provider_reference')->toString()
                    : $locked->provider_reference,
                'status' => ServiceProviderBillStatus::PendingValidation,
                'submitted_at' => now(),
            ])->save();

            if ($request->hasFile('file')) {
                $locked->addMedia($request->file('file'))->toMediaCollection('invoice');
            }

            return $locked->refresh()->load('media');
        });

        return $this->json(['data' => ServiceProviderBillResource::make($bill)->resolve($request)]);
    }

    /** Le devis approuvé de l'intervention de la facture, 0 s'il n'y en a pas (la règle de l'observateur). */
    private function approvedQuote(ServiceProviderBill $bill): float
    {
        $mr = $bill->maintenanceRequest()->first(['id', 'quote_amount', 'quote_decision_at', 'quote_rejection_reason']);

        return $mr !== null && $mr->quote_decision_at !== null && $mr->quote_rejection_reason === null
            ? (float) ($mr->quote_amount ?? 0)
            : 0.0;
    }

    public function validateBill(ValidateServiceProviderBillRequest $request, ServiceProviderBill $serviceProviderBill): JsonResponse
    {
        $bill = $this->decide($serviceProviderBill, $request, function (ServiceProviderBill $locked) use ($request): array {
            // TCK-2270 (P224.01) — le travail d'une intervention contestée ou annulée n'est pas rendu.
            abort_code_unless($locked->requestIsBillable(), 422, 'service_provider_bill.request_not_completed');

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
        $payout = $this->payouts->createForBill($request->user(), $serviceProviderBill, $request->validatedAvecInstants());

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
                // TCK-2911 (ADR-0120 § 1) — le brouillon n'est pas une pièce reçue : l'agence ne le lit
                // qu'une fois envoyé par son prestataire.
                $q->orWhere(fn (Builder $agence) => $agence->where('agency_id', $staffAgencyId)
                    ->where('status', '!=', ServiceProviderBillStatus::Draft->value));
            }
        });
    }
}
