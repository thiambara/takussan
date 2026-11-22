<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementSourceFormat;
use App\Services\Accounting\StatementParser\BankPresetRegistry;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2932 — `GET /api/agencies/{agency}/reconciliation/supported-formats` : les formats que l'import
 * lit (dérivés de `BankStatementSourceFormat`) et les banques à préréglage ÉPROUVÉ
 * ({@see BankPresetRegistry}, vide tant qu'aucun export réel n'a été fourni — D-67).
 */
class SupportedStatementFormatsController extends Controller
{
    /** Les extensions admises par format : celles de `StoreBankStatementRequest::bodyRules()`. */
    private const EXTENSIONS = [
        'csv' => ['csv', 'txt'],
        'ofx' => ['ofx', 'xml'],
    ];

    public function __invoke(Agency $agency, BankPresetRegistry $registry): JsonResponse
    {
        $this->authorize('viewAny', [BankStatement::class, $agency]);

        $formats = array_map(fn (BankStatementSourceFormat $format) => [
            'code' => $format->value,
            'extensions' => self::EXTENSIONS[$format->value] ?? [$format->value],
            // Le CSV se lit selon le mapping de l'agence (`…/bank-statements/csv-mapping`) ; l'OFX est normé.
            'configurable_columns' => $format === BankStatementSourceFormat::Csv,
        ], BankStatementSourceFormat::cases());

        $banks = array_map(fn (array $preset) => [
            'code' => $preset['code'],
            'name' => $preset['name'],
            'format' => $preset['format'],
            'mapping' => $preset['mapping'],
        ], $registry->presets());

        return $this->json(['data' => ['formats' => $formats, 'banks' => $banks]]);
    }
}
