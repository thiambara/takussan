<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreMaintenanceQuoteAlternativeRequest;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\Enums\Currency;
use App\Models\MaintenanceQuoteAlternative;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceStateMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2911 (ADR-0120 § 3) — les devis concurrents consultés d'une intervention. Le personnel de
 * l'agence du bien les enregistre et les retire ; chaque geste rend la demande au détail, où
 * `quote_alternatives` n'est servi qu'aux donneurs d'ordre. Pas sur une demande close ou annulée.
 */
class MaintenanceQuoteAlternativeController extends Controller
{
    public function store(StoreMaintenanceQuoteAlternativeRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        DB::transaction(function () use ($request, $maintenanceRequest): void {
            $locked = MaintenanceRequest::query()->whereKey($maintenanceRequest->id)->lockForUpdate()->firstOrFail();
            abort_code_if(app(MaintenanceStateMachine::class)->isTerminal($locked->status), 422, 'maintenance.terminal_request');
            abort_code_if(
                $locked->quoteAlternatives()->count() >= MaintenanceQuoteAlternative::MAX_PER_REQUEST,
                422,
                'maintenance.quote_alternatives_full',
                ['max' => MaintenanceQuoteAlternative::MAX_PER_REQUEST],
            );

            $currency = $request->validated('currency') ?? $locked->quote_currency ?? Currency::XOF->value;
            $alternative = MaintenanceQuoteAlternative::query()->create([
                'maintenance_request_id' => $locked->id,
                'provider_id' => $request->validated('provider_id'),
                'provider_name' => $request->validated('provider_name'),
                'amount' => Currency::roundAmount((float) $request->validated('amount'), $currency),
                'currency' => $currency,
                'created_by_id' => $request->user()->id,
            ]);

            if ($request->hasFile('file')) {
                $alternative->addMedia($request->file('file'))->toMediaCollection('quote');
            }
        });

        return $this->json(['data' => $this->detail($request, $maintenanceRequest)], 201);
    }

    public function destroy(Request $request, MaintenanceRequest $maintenanceRequest, int $alternative): JsonResponse
    {
        $this->authorize('manageQuoteAlternatives', $maintenanceRequest);
        abort_code_if(app(MaintenanceStateMachine::class)->isTerminal($maintenanceRequest->status), 422, 'maintenance.terminal_request');

        // Le devis se cherche DANS la demande de la route : celui d'une autre demande rend 404.
        $found = $maintenanceRequest->quoteAlternatives()->whereKey($alternative)->firstOrFail();
        $found->delete();

        return $this->json(['data' => $this->detail($request, $maintenanceRequest)]);
    }

    /** @return array<string, mixed> */
    private function detail(Request $request, MaintenanceRequest $maintenanceRequest): array
    {
        $maintenanceRequest->refresh()->load(['property', 'requester', 'assignee']);

        return MaintenanceRequestResource::make($maintenanceRequest)->resolve($request);
    }
}
