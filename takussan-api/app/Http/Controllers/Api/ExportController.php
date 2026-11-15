<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ShowExportRequest;
use App\Models\Activity;
use App\Services\Export\ExportDataService;
use App\Services\Export\ExportFiles;
use App\Services\Export\ExportWriter;
use Illuminate\Http\JsonResponse;

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
        private readonly ExportFiles $files,
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

        $registre = $this->registre($request, $entity);

        $payload = $this->data->collect($entity, $user, $validated + $registre + ['own_lines_only' => $ownLinesOnly]);

        // TCK-2866 (ADR-0115) — le fichier est rendu UNE fois : servi, et gardé pour « Retélécharger ».
        $file = $this->writer->render($format, $payload);

        $activity = activity('export')
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

        if ($activity instanceof Activity) {
            $this->files->keep($user, $staffAgencyId ?? $user->agency_id, $activity, $entity, $format, $ownLinesOnly, $file);
        }

        $response = $this->writer->serve($file['bytes'], $file['filename'], $file['mime']);

        // TCK-1308 (piste P112.03) — la coupure au plafond se signale par un en-tête, que le relais
        // du front transmet à l'écran ; le fichier, lui, reste tel quel.
        if ($payload['truncated']) {
            $response->headers->set('X-Export-Truncated', (string) $payload['limit']);
        }

        return $response;
    }

    /**
     * TCK-2866 — `GET /api/export/{entity}/count` : `{count, limit}`, le nombre de lignes que
     * l'export produirait avec les MÊMES paramètres (bornes, `filter[…]` du registre, lignes propres
     * du bénéficiaire), sous le même droit et dans le même ordre (404, 403, puis 422), et le plafond
     * du format au-delà duquel le fichier serait coupé.
     */
    public function count(ShowExportRequest $request, string $entity): JsonResponse
    {
        $filters = $request->validated() + $this->registre($request, $entity) + ['own_lines_only' => $request->ownLinesOnly()];

        return $this->json(['data' => $this->data->count($entity, $request->user(), $filters)]);
    }

    /**
     * TCK-2721 — les filtres du registre (`filter[…]`, `sort`) ne passent PAS par les règles de
     * `ShowExportRequest` : la sélection de l'historique les lit et les refuse elle-même (422),
     * APRÈS le 403 — comme la liste.
     *
     * @return array<string, mixed>
     */
    private function registre(ShowExportRequest $request, string $entity): array
    {
        return $entity === 'payment_history'
            ? ['history_filters' => (array) $request->input('filter', []), 'history_sort' => $request->input('sort', '-date')]
            : [];
    }
}
