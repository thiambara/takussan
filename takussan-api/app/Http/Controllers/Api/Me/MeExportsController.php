<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\ListMeExportsRequest;
use App\Models\Activity;
use App\Services\Audit\AuditAgencyResolver;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2627 — « Mes derniers exports », relus du journal que `ExportController::show` écrit déjà
 * (`export` / `data_exported`). Rien n'est stocké ni retéléchargé : « Refaire » rejoue
 * `export/{entity}` avec les mêmes paramètres, sous les capacités d'AUJOURD'HUI.
 *
 * Les lignes de l'appelant seul (`causer`), dans son agence active — la même expression que
 * l'écrivain (`staffAgencyId() ?? agency_id`), reportée par lui dans `properties.agency_id`, puis
 * dans la colonne `agency_id` du journal ({@see AuditAgencyResolver}).
 */
class MeExportsController extends Controller
{
    public function index(ListMeExportsRequest $request): JsonResponse
    {
        $user = $request->user();
        $agencyId = $user->staffAgencyId() ?? $user->agency_id;

        $rows = Activity::query()
            ->where('log_name', 'export')
            ->where('event', 'data_exported')
            ->where('causer_type', $user->getMorphClass())
            ->where('causer_id', $user->getKey())
            ->when(
                $agencyId !== null,
                fn ($q) => $q->where('agency_id', (int) $agencyId),
                fn ($q) => $q->whereNull('agency_id'),
            )
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($request->limit())
            ->get(['id', 'created_at', 'properties'])
            ->map(function (Activity $activity): array {
                $filters = (array) ($activity->properties?->get('filters') ?? []);

                return [
                    'at' => $this->instant($activity->created_at),
                    'entity' => $activity->properties?->get('entity'),
                    'format' => $activity->properties?->get('format'),
                    'filters' => ['from' => $filters['from'] ?? null, 'to' => $filters['to'] ?? null],
                    'row_count' => (int) ($activity->properties?->get('row_count') ?? 0),
                ];
            })
            ->values()
            ->all();

        return $this->json(['data' => $rows]);
    }
}
