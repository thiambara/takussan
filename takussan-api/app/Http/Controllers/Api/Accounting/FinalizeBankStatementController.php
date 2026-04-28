<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\BankStatementResource;
use App\Models\BankStatement;
use App\Services\Accounting\ReconciliationManager;
use Illuminate\Http\Request;

class FinalizeBankStatementController extends Controller
{
    public function __invoke(BankStatement $statement, Request $request, ReconciliationManager $manager)
    {
        $this->authorize('finalize', $statement);

        $updated = $manager->finalize($statement, $request->user());

        return BankStatementResource::make($updated);
    }
}
