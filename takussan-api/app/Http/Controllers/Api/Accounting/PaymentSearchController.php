<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\MatchCandidateResource;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Services\Accounting\PaymentSearchService;
use Illuminate\Http\Request;

class PaymentSearchController extends Controller
{
    public function __invoke(Agency $agency, Request $request, PaymentSearchService $service)
    {
        $this->authorize('viewAny', [BankStatement::class, $agency]);

        $candidates = $service->search(
            agency: $agency,
            query: $request->query('q', ''),
            amountHint: $request->float('amount') ?: null,
            limit: 20,
        );

        return MatchCandidateResource::collection($candidates);
    }
}
