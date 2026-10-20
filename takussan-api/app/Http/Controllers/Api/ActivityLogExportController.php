<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Audit\ExportActivityLogRequest;
use App\Jobs\Audit\ExportActivityLogJob;
use App\Models\User;
use App\Services\Audit\ActivityLogExporter;
use App\Services\Export\ExportWriter;
use App\Support\AgencyKindGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;

class ActivityLogExportController extends Controller
{
    public function __construct(
        private readonly ActivityLogExporter $exporter,
        private readonly ExportWriter $writer,
    ) {}

    public function export(ExportActivityLogRequest $request): mixed
    {
        Gate::authorize('export', Activity::class);

        $user = $request->user();
        $agencyId = $request->activeProfile()?->agency_id ?? $user->agency_id;
        AgencyKindGuard::ensureStandardForNonGlobal($user, $agencyId);

        $filters = $request->resolvedFilters();
        $format = $request->validated('format');

        $count = $this->exporter->count($user, $filters, $agencyId);

        // Log the export action itself (AC7).
        activity()
            ->causedBy($user)
            ->withProperties(['count' => $count, 'format' => $format])
            ->event('exported')
            ->log('Exported audit trail');

        if ($count > 5000) {
            ExportActivityLogJob::dispatch($user, array_merge($filters, ['format' => $format]), $agencyId);

            return response()->json([
                'message' => __('messages.activity_log_export_queued'),
            ], 202);
        }

        $payload = $this->exporter->buildPayload($user, $filters, $agencyId);

        return $this->writer->respond($format, $payload);
    }

    /**
     * Serve an async export file via signed temporary URL (TTL 24h).
     *
     * TCK-1054 (P63.01) — le lien est lié à son demandeur : `user`, `file` et `name` sont signés
     * ensemble, et le fichier ne se cherche que dans le dossier du demandeur signé, qui doit
     * toujours exister. Un lien ne sert donc que le fichier écrit pour celui qui l'a reçu.
     */
    public function download(Request $request): mixed
    {
        if (! $request->hasValidSignature()) {
            abort_code(403, 'activity_log.export_link_invalid');
        }

        $userId = filter_var($request->query('user'), FILTER_VALIDATE_INT);
        $file = (string) $request->query('file', '');
        if ($userId === false || preg_match(self::FICHIER, $file) !== 1 || ! User::query()->whereKey($userId)->exists()) {
            abort(404);
        }

        $path = self::storagePath($userId, $file);
        if (! Storage::exists($path)) {
            abort(404);
        }

        return Storage::download($path, (string) $request->query('name', $file));
    }

    /** Le nom opaque que le job donne au fichier : un UUID et l'extension du format. */
    private const FICHIER = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(csv|xlsx)$/';

    /** Le chemin d'un export asynchrone : le dossier de son demandeur, puis le nom opaque. */
    public static function storagePath(int $userId, string $file): string
    {
        return "exports/audit/{$userId}/{$file}";
    }
}
