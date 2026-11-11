<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ShowExportRequest;
use App\Models\Agency;
use App\Models\Enums\Capability;
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

    /**
     * TCK-587 (ADR-0031 §2) — capacité exigée du PERSONNEL, par entité. Le bailleur (non personnel)
     * garde l'export de ses biens et baux, borné par `ExportDataService::scopeToActor()`.
     */
    private const CAPABILITY = [
        'customers' => Capability::CrmExport,
        'payments' => Capability::PaymentsExport,
        'leases' => Capability::ReportsExport,
        'properties' => Capability::ReportsExport,
        // TCK-595 (§7) — les exports financiers de l'agence : `reports.export`, et au PERSONNEL seul.
        'payouts' => Capability::ReportsExport,
        'invoices' => Capability::ReportsExport,
        'commissions' => Capability::ReportsExport,
        'aging' => Capability::ReportsExport,
        'deposits' => Capability::ReportsExport,
        // TCK-2721 — le registre des encaissements d'« Argent », avec ses filtres : la capacité de
        // l'entité `payments`.
        'payment_history' => Capability::PaymentsExport,
    ];

    /**
     * TCK-595 — ni le bailleur ni le locataire n'exportent les finances d'une agence. TCK-2721 — le
     * registre des encaissements non plus : c'est un écran du personnel (`/app/agency/finances`).
     */
    private const STAFF_ONLY = ['payouts', 'invoices', 'commissions', 'aging', 'deposits', 'payment_history'];

    public function show(ShowExportRequest $request, string $entity)
    {
        $user = $request->user();
        abort_unless($user, 401);

        abort_code_unless(isset(self::CAPABILITY[$entity]), 404, 'export.entity_unknown', ['entity' => $entity]);

        // TCK-587 — le contrôle se fait EN TÊTE, avant toute requête. Il ouvrait l'export à tout
        // membre (agent comme admin) sans lire `crm.export`, `payments.export` ni `reports.export`,
        // et le prédicat d'agence (`isAgentAt` sur `$user->agency_id`) ne distinguait pas le
        // personnel du bailleur.
        $staffAgencyId = $user->staffAgencyId();
        $ownLinesOnly = false;
        if (! $user->isSuperAdmin()) {
            if ($staffAgencyId !== null) {
                $allowed = $user->canActAt(self::CAPABILITY[$entity], Agency::query()->find($staffAgencyId));
                // TCK-2661 — sans `reports.export`, le bénéficiaire exporte encore SES commissions, et
                // elles seules (même s'il lit celles de l'agence au relevé).
                $ownLinesOnly = ! $allowed && $entity === 'commissions';
                abort_code_unless($allowed || $ownLinesOnly, 403, 'export.forbidden');
            } elseif ($entity === 'customers' || in_array($entity, self::STAFF_ONLY, true)) {
                abort_code(403, 'export.forbidden');
            } elseif ($entity === 'properties'
                && ! ($user->agency_id !== null && $user->isOwnerAt((int) $user->agency_id))) {
                abort_code(403, 'export.forbidden');
            }
        }

        $validated = $request->validated();
        $format = $validated['format'] ?? 'csv';

        // TCK-2721 — les filtres du registre (`filter[…]`, `sort`) ne passent PAS par
        // `ShowExportRequest` : ses règles courent avant le contrôle de capacité, et un filtre mal
        // formé rendrait 422 à qui n'a pas le droit d'exporter. La sélection de l'historique les lit
        // et les refuse elle-même (422), ici, APRÈS le 403 — comme la liste.
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
