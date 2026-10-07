<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ShowExportRequest;
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

    public function show(ShowExportRequest $request, string $entity)
    {
        $user = $request->user();
        abort_unless($user, 401);

        $validated = $request->validated();

        $allowed = ['payments', 'leases', 'customers', 'properties'];
        abort_unless(in_array($entity, $allowed, true), 404, "Unknown entity: {$entity}");

        $agencyId = $user->agency_id;
        $isStaff = $user->isSuperAdmin()
            || ($agencyId !== null && (
                $user->isAgencyAdminAt((int) $agencyId)
                || $user->isAgentAt((int) $agencyId)
            ));

        if ($entity === 'customers' && ! $isStaff) {
            abort(403, 'CRM export restricted to agency staff.');
        }
        if ($entity === 'properties'
            && ! $isStaff
            && ! ($agencyId !== null && $user->isOwnerAt((int) $agencyId))) {
            abort(403, 'Properties export restricted to staff and owners.');
        }

        $format = $validated['format'] ?? 'csv';

        $payload = $this->data->collect($entity, $user, $validated);

        return $this->writer->respond($format, $payload);
    }
}
