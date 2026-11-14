<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ShowExportRequest;
use App\Services\Export\ExportDataService;
use App\Services\Export\ExportWriter;
use Illuminate\Contracts\Support\Responsable;

/**
 * GET /api/export/{entity}?format=csv|xlsx|pdf
 *
 * TCK-032 P2 — data exports. Supported entities: payments, leases, customers,
 * properties ; TCK-595 (§7) adds payouts, invoices, commissions, aging and
 * deposits. All outputs respect the actor's role scope (agency / owner /
 * tenant) — see `ExportDataService::scopeToActor()`. TCK-2721 adds
 * `payment_history`, the cash-receipts register with its `filter[…]` (the
 * selection of `GET /api/payments/history`, staff only).
 *
 * Query params:
 *   - format: csv|xlsx|pdf (default csv)
 *   - from, to: optional ISO date bounds (YYYY-MM-DD)
 *   - limit: cap rows (default 5000, max 10000 ; 200 en PDF — TCK-713, TCK-1306)
 */
class ExportController extends Controller
{
    public function __construct(
        private readonly ExportDataService $data,
        private readonly ExportWriter $writer,
    ) {}

    public function show(ShowExportRequest $request, string $entity)
    {
        // L'entité (404) et le droit d'exporter (403) se jugent dans `ShowExportRequest::authorize()`,
        // avant ses règles (422).
        $user = $request->user();
        $staffAgencyId = $user->staffAgencyId();
        $ownLinesOnly = $request->ownLinesOnly();

        $validated = $request->validated();
        $format = $validated['format'] ?? 'csv';

        // TCK-2721 — les filtres du registre (`filter[…]`, `sort`) ne passent PAS par les règles de
        // `ShowExportRequest` : la sélection de l'historique les lit et les refuse elle-même (422),
        // ici, APRÈS le 403 — comme la liste.
        $registre = $entity === 'payment_history'
            ? ['history_filters' => (array) $request->input('filter', []), 'history_sort' => $request->input('sort', '-date')]
            : [];

        $payload = $this->data->collect($entity, $user, $validated + $registre + ['own_lines_only' => $ownLinesOnly]);

        activity('export')
            ->causedBy($user)
            ->event('data_exported')
            ->withProperties([
                'entity' => $entity,
                'filters' => array_intersect_key($validated, array_flip(['from', 'to', 'limit']))
                    + ($registre !== [] ? ['filter' => $registre['history_filters']] : []),
                'row_count' => count($payload['rows']),
                'agency_id' => $staffAgencyId ?? $user->agency_id,
                'format' => $format,
            ])
            ->log('data_exported');

        $response = $this->writer->respond($format, $payload);

        // TCK-1308 (piste P112.03) — la coupure au plafond se signale par un en-tête, que le relais
        // du front transmet à l'écran ; le fichier, lui, reste tel quel.
        if ($payload['truncated']) {
            $response = $response instanceof Responsable ? $response->toResponse($request) : $response;
            $response->headers->set('X-Export-Truncated', (string) $payload['limit']);
        }

        return $response;
    }
}
