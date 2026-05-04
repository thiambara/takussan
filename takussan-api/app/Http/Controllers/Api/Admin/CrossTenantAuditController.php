<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Spatie\Activitylog\Models\Activity;
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
 * redact any key whose name *looks* sensitive before serializing.
 */
class CrossTenantAuditController extends Controller
{
    /** @var list<string> case-insensitive substrings that mark a key as sensitive */
    private const REDACTED_KEY_PATTERNS = [
        'password',
        'token',
        'secret',
        'api_key',
        'apikey',
        'private_key',
        'recovery',
        'two_factor',
        '2fa',
        'credit_card',
        'card_number',
        'cvv',
        'authorization',
    ];

    public function index(Request $request): JsonResponse
    {
        $perPage = (int) ($request->query('per_page') ?? 50);
        $perPage = $perPage > 0 ? min($perPage, 200) : 50;

        $query = QueryBuilder::for(Activity::query())
            ->allowedFilters(
                AllowedFilter::exact('log_name'),
                AllowedFilter::exact('event'),
                AllowedFilter::exact('causer_id'),
                AllowedFilter::exact('causer_type'),
                AllowedFilter::exact('subject_id'),
                AllowedFilter::partial('subject_type'),
                AllowedFilter::callback('date_from', fn ($q, $value) => $q->where('created_at', '>=', $value)),
                AllowedFilter::callback('date_to', fn ($q, $value) => $q->where('created_at', '<=', $value)),
            )
            ->allowedIncludes('causer', 'subject')
            ->allowedSorts('created_at', 'event')
            ->defaultSort('-created_at');

        $paginator = $query->paginate($perPage);

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
                'properties' => $this->redactProperties($log->properties),
                'created_at' => $log->created_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }

    /**
     * Walk the properties payload and replace the value of any key whose
     * name matches a sensitive pattern. Spatie stores `properties` as a
     * Collection-cast JSON column; normalize to array first so the recursion
     * works uniformly.
     */
    private function redactProperties(mixed $properties): mixed
    {
        if ($properties === null) {
            return null;
        }

        $array = $properties instanceof Collection
            ? $properties->toArray()
            : (array) $properties;

        array_walk_recursive($array, function (mixed &$value, mixed $key): void {
            if (! is_string($key)) {
                return;
            }
            $lower = strtolower($key);
            foreach (self::REDACTED_KEY_PATTERNS as $pattern) {
                if (str_contains($lower, $pattern)) {
                    $value = '[REDACTED]';

                    return;
                }
            }
        });

        return $array;
    }
}
