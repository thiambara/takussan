<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Audit\ExportActivityLogRequest;
use App\Jobs\Audit\ExportActivityLogJob;
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
        AgencyKindGuard::ensureStandardForNonGlobal(
            $user,
            $request->activeProfile()?->agency_id ?? $user->agency_id,
        );

        $filters = $request->resolvedFilters();
        $format = $request->validated('format');

        $count = $this->exporter->count($user, $filters);

        // Log the export action itself (AC7).
        activity()
            ->causedBy($user)
            ->withProperties(['count' => $count, 'format' => $format])
            ->event('exported')
            ->log('Exported audit trail');

        if ($count > 5000) {
            ExportActivityLogJob::dispatch($user, array_merge($filters, ['format' => $format]));

            return response()->json([
                'message' => 'Export en préparation, téléchargement imminent…',
            ], 202);
        }

        $payload = $this->exporter->buildPayload($user, $filters);

        return $this->writer->respond($format, $payload);
    }

    /**
     * Serve an async export file via signed temporary URL (TTL 24h).
     */
    public function download(Request $request): mixed
    {
        if (! $request->hasValidSignature()) {
            abort(403, 'Lien expiré ou invalide.');
        }

        $path = $request->query('path');
        if (! $path || ! Storage::exists((string) $path)) {
            abort(404);
        }

        return Storage::download((string) $path);
    }
}
