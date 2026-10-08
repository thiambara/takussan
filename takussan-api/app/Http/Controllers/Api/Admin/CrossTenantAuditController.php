<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Filters\ExactIdentifierFilter;
use App\Models\Activity;
use App\Services\Audit\ActivityLogExporter;
use App\Services\Privacy\PersonalDataAccessLogger;
use App\Support\Audit\PropertyRedactor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * TCK-144 — Cross-tenant audit trail for super-admin. Unlike
 * `AuditLogController` (which scopes agency_admin queries to their own
 * agency), this endpoint exposes every activity log entry. Spatie filters
 * are the canonical way to narrow down — no client-side filtering.
 *
 * The activity log's `properties` payload is written by domain code across
 * the codebase. Most writers are well-behaved, but defense-in-depth here
 * matters: a careless future writer could land a token / secret into the
 * payload, and this endpoint surfaces every log line to super-admin. We
 * redact any key whose name *looks* sensitive before serializing — {@see PropertyRedactor},
 * shared since TCK-601 with the agency audit and both exports.
 */
class CrossTenantAuditController extends Controller
{
    /**
     * TCK-601 (F) — le préréglage « Gestes sensibles » (`filter[sensitive]=1`) : consultations de
     * données personnelles, registre des droits, sécurité et support, KYC, rôles et adhésions,
     * intégrations, exports. Liste de `log_name` nommée ici, une fois, pour l'index et l'export.
     *
     * @var list<string>
     */
    public const SENSITIVE_LOG_NAMES = [
        PersonalDataAccessLogger::LOG_NAME,
        'Privacy',
        'PrivacyRequest',
        'Security',
        'UserSupport',
        'KYC',
        'KycDossier',
        'Membership',
        'AgencyRole',
        'Integration',
        'export',
    ];

    /** Au-delà, l'export se resserre par les filtres : un fichier de la console n'est pas un dump. */
    public const EXPORT_MAX_ROWS = 50_000;

    public function index(Request $request): JsonResponse
    {
        $perPage = (int) ($request->query('per_page') ?? 50);
        $perPage = $perPage > 0 ? min($perPage, 200) : 50;

        $paginator = $this->filteredQuery($request)->paginate($perPage);

        return $this->json([
            'data' => $paginator->getCollection()->map(fn (Activity $log) => [
                'id' => $log->id,
                'log_name' => $log->log_name,
                'event' => $log->event,
                'description' => $log->description,
                'causer_type' => $log->causer_type,
                'causer_id' => $log->causer_id,
                'subject_type' => $log->subject_type,
                'subject_id' => $log->subject_id,
                'properties' => PropertyRedactor::redact($log->properties),
                'created_at' => $log->created_at?->toIso8601String(),
            ])->all(),
            'meta' => $this->paginationMeta($paginator),
        ]);
    }

    /**
     * TCK-601 (F, AC17) — l'audit de la console en CSV, mêmes filtres que l'index : le fichier est
     * écrit sur le disque privé et servi par un lien signé (la route de téléchargement de l'export
     * d'agence). `properties` y est expurgé comme à l'écran, et l'export lui-même est journalisé.
     */
    public function export(Request $request, ActivityLogExporter $exporter): JsonResponse
    {
        $query = $this->filteredQuery($request);
        $count = (clone $query)->count();
        if ($count > self::EXPORT_MAX_ROWS) {
            abort_code(422, 'activity_log.export_too_large');
        }

        $filename = 'audit-plateforme-'.now()->format('Ymd-His');
        $path = 'exports/audit/'.$filename.'-'.bin2hex(random_bytes(6)).'.csv';
        Storage::put($path, $exporter->csvContent($exporter->payloadForQuery($query->getEloquentBuilder(), $filename)));

        $expiresAt = now()->addHour();

        activity('export')
            ->causedBy($request->user())
            ->event('audit_exported')
            ->withProperties([
                'scope' => 'platform',
                'filters' => (array) $request->query('filter', []),
                'count' => $count,
            ])
            ->log('audit_exported');

        return $this->json([
            'data' => [
                'url' => URL::temporarySignedRoute('activity-logs.export.download', $expiresAt, ['path' => $path]),
                'expires_at' => $expiresAt->toIso8601String(),
                'count' => $count,
            ],
        ]);
    }

    private function filteredQuery(Request $request): QueryBuilder
    {
        return QueryBuilder::for(Activity::query(), $request)
            ->allowedFilters(
                AllowedFilter::exact('log_name'),
                AllowedFilter::exact('event'),
                AllowedFilter::custom('causer_id', new ExactIdentifierFilter),
                AllowedFilter::exact('causer_type'),
                AllowedFilter::custom('subject_id', new ExactIdentifierFilter),
                AllowedFilter::partial('subject_type'),
                AllowedFilter::callback('date_from', fn ($q, $value) => $q->where('created_at', '>=', $value)),
                AllowedFilter::callback('date_to', fn ($q, $value) => $q->where('created_at', '<=', $value)),
                AllowedFilter::callback('sensitive', function ($q, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $q->whereIn('log_name', self::SENSITIVE_LOG_NAMES);
                    }
                }),
            )
            ->allowedIncludes('causer', 'subject')
            ->allowedSorts('created_at', 'event')
            ->defaultSort('-created_at');
    }
}
