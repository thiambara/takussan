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
use Illuminate\Support\Facades\URL;
use Spatie\Activitylog\Models\Activity;

class ActivityLogExportController extends Controller
{
    /**
     * TCK-1418 (P78.03) — PhpSpreadsheet bâtit la feuille XLSX entière en mémoire. Mesuré après le
     * préchargement de TCK-1414 : 20 000 lignes, 64 s (sous les 85 s du job,
     * `ExportActivityLogJob::$timeout`) et 118 Mo de surcroît (sous les 256 Mo de `memory_limit`).
     * Au-delà, le refus déjà connu de l'export : le CSV reste servi.
     */
    public const XLSX_MAX_ROWS = 20_000;

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
        if ($format === 'xlsx' && $count > self::XLSX_MAX_ROWS) {
            abort_code(422, 'activity_log.export_too_large');
        }

        // Log the export action itself (AC7).
        activity()
            ->causedBy($user)
            ->withProperties(['count' => $count, 'format' => $format])
            ->event('exported')
            ->log('Exported audit trail');

        if ($count > 5000) {
            // P193.04 (TCK-2051) — le fichier asynchrone ne s'atteint que par le lien du courriel :
            // un compte sans e-mail n'y aurait aucun chemin.
            if (! is_string($user->email) || $user->email === '') {
                abort_code(422, 'activity_log.export_needs_email');
            }
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
     * ensemble, et le fichier ne se cherche que dans le dossier du demandeur signé.
     *
     * TCK-613 (ADR-0044 §2) — le lien n'est plus un droit au porteur : la route est sous
     * `auth:sanctum`, le demandeur signé doit ÊTRE l'appelant (403 à tout autre, super-admin
     * compris), et chaque téléchargement est journalisé, sans le contenu. La signature est
     * RELATIVE : le front relaie le lien par son BFF, dont l'hôte amont n'est pas celui du lien.
     * Deux routes servent cette action — `activity-logs.export.download` (le lien du courriel de
     * l'export d'agence) et `admin.audit.export.download` (la console, par le relais
     * `/api/super-admin/*`) — chacune signée pour son propre chemin.
     */
    public function download(Request $request): mixed
    {
        if (! $request->hasValidRelativeSignature()) {
            abort_code(403, 'activity_log.export_link_invalid');
        }

        $userId = filter_var($request->query('user'), FILTER_VALIDATE_INT);
        $file = (string) $request->query('file', '');
        if ($userId === false || preg_match(self::FICHIER, $file) !== 1) {
            abort(404);
        }
        abort_unless((int) $request->user()->getKey() === $userId, 403);

        $path = self::storagePath($userId, $file);
        if (! Storage::disk(self::DISK)->exists($path)) {
            abort(404);
        }

        // Le registre des exports (famille `export`, gardée 5 ans par `activitylog:prune`) : le
        // téléchargement, jamais ce que le fichier contient.
        activity('export')
            ->causedBy($request->user())
            ->event('audit_export_downloaded')
            ->withProperties(['file' => $file, 'route' => $request->route()?->getName()])
            ->log('audit_export_downloaded');

        return Storage::disk(self::DISK)->download($path, (string) $request->query('name', $file));
    }

    /**
     * TCK-613 — le lien signé, RELATIF (`/api/…?expires=…&signature=…`), d'un export écrit pour
     * `$userId`. `$route` : `activity-logs.export.download` ou `admin.audit.export.download`.
     */
    public static function signedPath(string $route, int $userId, string $file, string $name, \DateTimeInterface $expiresAt): string
    {
        return URL::temporarySignedRoute($route, $expiresAt, ['user' => $userId, 'file' => $file, 'name' => $name], absolute: false);
    }

    /** Le nom opaque que le job donne au fichier : un UUID et l'extension du format. */
    private const FICHIER = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(csv|xlsx)$/';

    /**
     * TCK-1145 (P77.04) — le disque des exports asynchrones, nommé comme celui des exports RGPD et
     * de rapport : le disque par défaut suit `FILESYSTEM_DISK`, qu'un environnement peut viser
     * ailleurs que le volume privé.
     */
    public const DISK = 'local';

    /** TCK-1143 (P63.04) — la durée de vie du lien le plus long ; au-delà, le fichier est purgé. */
    public const LINK_TTL_HOURS = 24;

    /** TCK-1143 (P63.04) — la racine des exports asynchrones, que purge `PurgeExpiredActivityLogExports`. */
    public const STORAGE_ROOT = 'exports/audit';

    /** Le chemin d'un export asynchrone : le dossier de son demandeur, puis le nom opaque. */
    public static function storagePath(int $userId, string $file): string
    {
        return self::STORAGE_ROOT."/{$userId}/{$file}";
    }
}
