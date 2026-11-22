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

        // TCK-2900 (ADR-0113 § 6) — l'entrée du signalement (« Signalée par … — 2 photos, un message
        // vocal ») compte ce que la demande porte : les photos arrivent APRÈS la création
        // (`POST …/photos`), le compte se lit donc ici, d'une requête, et sur cette seule entrée.
        $entries = $this->withReportedMedia($entries, $maintenanceRequest);

        $startsWithRequest = $this->journal->startsWithRequest($maintenanceRequest);
        // La première page, telle que la requête la demande : `page` absent ou ≤ 1.
        if (! $startsWithRequest && $request->integer('page', 1) <= 1) {
            array_unshift($entries, MaintenanceJournalEntryResource::before());
        }

        return $this->paginated($paginator, $entries, ['starts_with_request' => $startsWithRequest]);
    }

    /**
     * TCK-2900 — `photos_count` et `has_voice_note` sur l'entrée `created` seule ; une page qui ne la
     * porte pas ne lit aucun média.
     *
     * @param  list<array<string, mixed>>  $entries
     * @return list<array<string, mixed>>
     */
    private function withReportedMedia(array $entries, MaintenanceRequest $maintenanceRequest): array
    {
        $created = array_filter($entries, fn (array $entry): bool => $entry['code'] === MaintenanceJournal::CREATED);
        if ($created === []) {
            return $entries;
        }

        // Une seule requête : `getMedia()` charge la relation `media`, que les deux lectures partagent.
        $photosCount = $maintenanceRequest->getMedia('photos')->count();
        $hasVoiceNote = $maintenanceRequest->hasVoiceNote();

        foreach (array_keys($created) as $index) {
            $entries[$index]['photos_count'] = $photosCount;
            $entries[$index]['has_voice_note'] = $hasVoiceNote;
        }

        return $entries;
    }
}
