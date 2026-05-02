<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Activitylog\Models\Activity;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * TCK-144 — Cross-tenant audit trail for super-admin. Unlike
 * `AuditLogController` (which scopes agency_admin queries to their own
 * agency), this endpoint exposes every activity log entry. Spatie filters
 * are the canonical way to narrow down — no client-side filtering.
 */
class CrossTenantAuditController extends Controller
{
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
                'properties' => $log->properties,
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
}
