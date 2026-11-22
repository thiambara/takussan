<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Accounting\PreviewBankStatementRequest;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\BankStatementStatus;
use App\Services\Accounting\StatementParser\StatementPreview;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2932 — `POST /api/agencies/{agency}/bank-statements/preview` : ce que l'import lirait du
 * relevé envoyé, SANS RIEN ÉCRIRE ({@see StatementPreview}). Le fichier est lu dans son dépôt
 * temporaire de la requête : il n'est jamais copié sur un disque.
 */
class BankStatementPreviewController extends Controller
{
    public function __invoke(PreviewBankStatementRequest $request, Agency $agency, StatementPreview $preview): JsonResponse
    {
        $path = $request->file('file')->getRealPath();
        $hash = hash_file('sha256', $path);

        $data = $preview->preview($agency, BankStatementSourceFormat::from((string) $request->validated('source_format')), $path);

        // Le même contrôle que l'import, rendu au lieu d'être opposé : un relevé `failed` se ré-importe.
        $data['already_imported'] = BankStatement::query()
            ->where('agency_id', $agency->id)
            ->where('file_hash', $hash)
            ->where('status', '!=', BankStatementStatus::Failed)
            ->exists();

        return $this->json(['data' => $data]);
    }
}
