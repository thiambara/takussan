<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Accounting\SearchPaymentsRequest;
use App\Http\Resources\Accounting\MatchCandidateResource;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementLineDirection;
use App\Services\Accounting\PaymentSearchService;

class PaymentSearchController extends Controller
{
    public function __invoke(Agency $agency, SearchPaymentsRequest $request, PaymentSearchService $service)
    {
        $this->authorize('viewAny', [BankStatement::class, $agency]);

        $candidates = $service->search(
            agency: $agency,
            query: (string) $request->query('q', ''),
            amountHint: $request->float('amount') ?: null,
            limit: 20,
            direction: BankStatementLineDirection::tryFrom((string) $request->query('direction', '')),
        );

        return MatchCandidateResource::collection($candidates);
    }
}
