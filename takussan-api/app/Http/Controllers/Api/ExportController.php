<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Export\ExportDataService;
use App\Services\Export\ExportWriter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

    public function show(Request $request, string $entity)
    {
        $user = $request->user();
        abort_unless($user, 401);

        $validated = $request->validate([
            'format' => ['sometimes', Rule::in(['csv', 'xlsx', 'excel', 'pdf'])],
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50000'],
        ]);

        $allowed = ['payments', 'leases', 'customers', 'properties'];
        abort_unless(in_array($entity, $allowed, true), 404, "Unknown entity: {$entity}");

        if ($entity === 'customers' && ! $user->hasRole(['super_admin', 'admin', 'agency_admin', 'agent'])) {
            abort(403, 'CRM export restricted to agency staff.');
        }
        if ($entity === 'properties' && ! $user->hasRole(['super_admin', 'admin', 'agency_admin', 'agent', 'owner'])) {
            abort(403, 'Properties export restricted to staff and owners.');
        }

        $format = $validated['format'] ?? 'csv';

        $payload = $this->data->collect($entity, $user, $validated);

        return $this->writer->respond($format, $payload);
    }
}
