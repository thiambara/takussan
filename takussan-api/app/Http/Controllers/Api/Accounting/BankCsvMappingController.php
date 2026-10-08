<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Accounting\UpdateBankCsvMappingRequest;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Services\Accounting\StatementParser\CsvDriver;
use Illuminate\Http\JsonResponse;

/**
 * TCK-593 — le mapping CSV d'une agence, enfin réglable : `Agency.bank_csv_mapping` n'était écrit
 * par aucune route, et seul le défaut du code (`date`/`amount`/`label`, `d/m/Y`) était utilisable.
 *
 * La lecture rend le mapping EFFECTIF (défaut du code recouvert par l'agence) : c'est celui qu'un
 * import figera sur le relevé. Autorisé comme l'import, par `BankStatementPolicy::create`.
 */
class BankCsvMappingController extends Controller
{
    public function show(Agency $agency): JsonResponse
    {
        $this->authorize('create', [BankStatement::class, $agency]);

        return $this->json(['data' => CsvDriver::effectiveMapping($agency->bank_csv_mapping)]);
    }

    public function update(Agency $agency, UpdateBankCsvMappingRequest $request): JsonResponse
    {
        $this->authorize('create', [BankStatement::class, $agency]);

        $agency->update(['bank_csv_mapping' => $request->validated()]);

        return $this->json(['data' => CsvDriver::effectiveMapping($agency->bank_csv_mapping)]);
    }
}
