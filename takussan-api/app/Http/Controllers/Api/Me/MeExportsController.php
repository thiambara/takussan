<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\ListMeExportsRequest;
use App\Http\Requests\Api\ShowExportRequest;
use App\Models\Activity;
use App\Models\ExportFile;
use App\Services\Audit\AuditAgencyResolver;
use App\Services\Export\ExportFiles;
use App\Services\Export\ExportWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-2627 — « Mes derniers exports », relus du journal que `ExportController::show` écrit déjà
 * (`export` / `data_exported`). « Refaire » rejoue `export/{entity}` avec les mêmes paramètres, sous
 * les capacités d'AUJOURD'HUI.
 *
 * TCK-2866 (ADR-0115) — le fichier de chaque export est désormais gardé `exports.retention_days`
 * jours ({@see ExportFile}) : chaque ligne porte son `id` (celui du journal) et `file {available,
 * expires_at}`, et {@see self::download()} le retélécharge, à son seul auteur, sous ses capacités
 * d'aujourd'hui.
 *
 * Les lignes de l'appelant seul (`causer`), dans son agence active — la même expression que
 * l'écrivain (`staffAgencyId() ?? agency_id`), reportée par lui dans `properties.agency_id`, puis
 * dans la colonne `agency_id` du journal ({@see AuditAgencyResolver}).
 */
class MeExportsController extends Controller
{
    public function __construct(
        private readonly ExportFiles $files,
        private readonly ExportWriter $writer,
    ) {}

    public function index(ListMeExportsRequest $request): JsonResponse
    {
        $user = $request->user();
        $agencyId = $user->staffAgencyId() ?? $user->agency_id;

        $activities = Activity::query()
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
            ->get(['id', 'created_at', 'properties']);

        // TCK-2866 — les fichiers gardés de ces lignes, en une requête.
        $files = ExportFile::query()
            ->whereIn('activity_id', $activities->modelKeys())
            ->where('user_id', $user->getKey())
            ->get(['id', 'activity_id', 'expires_at'])
            ->keyBy('activity_id');

        $rows = $activities
            ->map(function (Activity $activity) use ($files): array {
                $filters = (array) ($activity->properties?->get('filters') ?? []);
                $file = $files->get($activity->id);

                return [
                    // TCK-2866 — l'identifiant de `GET me/exports/{id}/download`.
                    'id' => (int) $activity->id,
                    'at' => $this->instant($activity->created_at),
                    'entity' => $activity->properties?->get('entity'),
                    'format' => $activity->properties?->get('format'),
                    'filters' => ['from' => $filters['from'] ?? null, 'to' => $filters['to'] ?? null],
                    'row_count' => (int) ($activity->properties?->get('row_count') ?? 0),
                    // TCK-2866 — le fichier gardé : retéléchargeable jusqu'à `expires_at`.
                    'file' => [
                        'available' => $file !== null && ! $file->isExpired(),
                        'expires_at' => $file !== null ? $this->instant($file->expires_at) : null,
                    ],
                ];
            })
            ->values()
            ->all();

        return $this->json(['data' => $rows]);
    }

    /**
     * TCK-2866 (ADR-0115 § 2) — `GET /api/me/exports/{id}/download` : le fichier gardé d'un export
     * passé, tel qu'il a été servi.
     *
     * - 404 : aucun export de ce numéro, ou aucun fichier gardé (export d'avant TCK-2866, fichier perdu) ;
     * - 403 : l'export d'un autre (super-admin compris : il n'en est pas l'auteur) ;
     * - 410 `export.file_expired` : l'échéance passée, que la purge ait tourné ou non ;
     * - 403 `export.forbidden` : l'auteur ne pourrait plus le refaire (même règle que l'export,
     *   {@see ShowExportRequest::judge()}), ou plus dans la même agence, ou ne pourrait plus refaire
     *   que ses propres lignes alors que le fichier en porte d'autres.
     */
    public function download(Request $request, int $id): Response
    {
        $user = $request->user();
        $activity = Activity::query()
            ->where('log_name', 'export')
            ->where('event', 'data_exported')
            ->find($id);
        abort_unless($activity !== null, 404);
        abort_unless(
            $activity->causer_type === $user->getMorphClass() && (int) $activity->causer_id === (int) $user->getKey(),
            403,
        );

        $file = ExportFile::query()->where('activity_id', $activity->id)->where('user_id', $user->getKey())->first();
        if ($file === null) {
            // Gardé puis purgé : l'échéance est passée ; jamais gardé (ou perdu) : rien à rendre.
            $purged = $activity->created_at !== null
                && $activity->created_at->lte(now()->subDays(max(1, (int) config('exports.retention_days', 7))));
            abort_code_unless(! $purged, 410, 'export.file_expired');
            abort(404);
        }
        abort_code_unless(! $file->isExpired(), 410, 'export.file_expired');

        $ownLinesOnly = ShowExportRequest::judge($user, $file->entity);
        abort_code_unless(! $ownLinesOnly || $file->own_lines_only, 403, 'export.forbidden');
        abort_code_unless(
            $user->isSuperAdmin() || (int) ($user->staffAgencyId() ?? $user->agency_id) === (int) $file->agency_id,
            403,
            'export.forbidden',
        );

        $bytes = $this->files->bytes($file);
        abort_unless($bytes !== null, 404);

        activity('export')
            ->causedBy($user)
            ->event('data_export_redownloaded')
            ->withProperties([
                'entity' => $file->entity,
                'format' => $file->format,
                'export_id' => (int) $activity->id,
                'agency_id' => $file->agency_id,
            ])
            ->log('data_export_redownloaded');

        return $this->writer->serve($bytes, $file->filename, $file->mime);
    }
}
