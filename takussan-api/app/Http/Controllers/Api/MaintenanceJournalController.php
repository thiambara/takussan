<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\MaintenanceJournalEntryResource;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceJournal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2786 — `GET /api/maintenance-requests/{id}/journal` : ce qui s'est passé sur la demande, et
 * quand, dans l'ordre où c'est arrivé (date, puis identifiant), paginé. Lu par le personnel de
 * l'agence du bien et le super-admin (`MaintenanceRequestPolicy::viewJournal`).
 *
 * Une demande créée avant le journal s'ouvre, sur sa première page, par l'entrée `journal.before`
 * (jamais écrite) ; `meta.starts_with_request` le dit aussi.
 */
class MaintenanceJournalController extends Controller
{
    public function __construct(private readonly MaintenanceJournal $journal) {}

    public function index(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('viewJournal', $maintenanceRequest);

        $paginator = $this->journal->entriesOf($maintenanceRequest)->paginate($this->tailleDePage($request, 50));
        $entries = MaintenanceJournalEntryResource::collection($paginator)->toArray($request);

        $startsWithRequest = $this->journal->startsWithRequest($maintenanceRequest);
        // La première page, telle que la requête la demande : `page` absent ou ≤ 1.
        if (! $startsWithRequest && $request->integer('page', 1) <= 1) {
            array_unshift($entries, MaintenanceJournalEntryResource::before());
        }

        return $this->paginated($paginator, $entries, ['starts_with_request' => $startsWithRequest]);
    }
}
