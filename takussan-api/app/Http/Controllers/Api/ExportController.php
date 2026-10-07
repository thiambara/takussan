<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ShowExportRequest;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Services\Export\ExportDataService;
use App\Services\Export\ExportWriter;

/**
 * GET /api/export/{entity}?format=csv|xlsx|pdf
 *
 * TCK-032 P2 — data exports. Supported entities: payments, leases, customers,
 * properties. All outputs respect the actor's role scope (agency / owner /
 * tenant) — see `ExportDataService::scopeToActor()`.
 *
 * Query params:
 *   - format: csv|xlsx|pdf (default csv)
 *   - from, to: optional ISO date bounds (YYYY-MM-DD)
 *   - limit: cap rows (default 5000, max 50000)
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
    ];

    public function show(ShowExportRequest $request, string $entity)
    {
        $user = $request->user();
        abort_unless($user, 401);

        abort_unless(isset(self::CAPABILITY[$entity]), 404, __('errors.export_unknown_entity'));

        // TCK-587 — le contrôle se fait EN TÊTE, avant toute requête. Il ouvrait l'export à tout
        // membre (agent comme admin) sans lire `crm.export`, `payments.export` ni `reports.export`,
        // et le prédicat d'agence (`isAgentAt` sur `$user->agency_id`) ne distinguait pas le
        // personnel du bailleur.
        $staffAgencyId = $user->staffAgencyId();
        if (! $user->isSuperAdmin()) {
            if ($staffAgencyId !== null) {
                abort_unless(
                    $user->canActAt(self::CAPABILITY[$entity], Agency::query()->find($staffAgencyId)),
                    403,
                    __('errors.export_forbidden'),
                );
            } elseif ($entity === 'customers') {
                abort(403, __('errors.export_forbidden'));
            } elseif ($entity === 'properties'
                && ! ($user->agency_id !== null && $user->isOwnerAt((int) $user->agency_id))) {
                abort(403, __('errors.export_forbidden'));
            }
        }

        $validated = $request->validated();
        $format = $validated['format'] ?? 'csv';

        $payload = $this->data->collect($entity, $user, $validated);

        activity('export')
            ->causedBy($user)
            ->event('data_exported')
            ->withProperties([
                'entity' => $entity,
                'filters' => array_intersect_key($validated, array_flip(['from', 'to', 'limit'])),
                'row_count' => count($payload['rows']),
                'agency_id' => $staffAgencyId ?? $user->agency_id,
                'format' => $format,
            ])
            ->log('data_exported');

        return $this->writer->respond($format, $payload);
    }
}
