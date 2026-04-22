<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Activitylog\Models\Activity;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

class AuditLogController extends Controller
{
    public function indexByEntity(Request $request, string $entity, int $id): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $query = Activity::query()->with('causer')
            ->where('subject_type', 'like', '%'.ucfirst($entity))
            ->where('subject_id', $id);

        $order = $request->input('order', 'desc') === 'asc' ? 'asc' : 'desc';
        $paginator = $query->orderBy('created_at', $order)
            ->paginate((int) $request->input('per_page', 50));

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
                'created_at' => $log->created_at,
            ])->all(),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        // Accept legacy flat params (?log_name=, ?event=, ?from=, ?to=, ?causer_id=…)
        // AND spatie-style nested filters (?filter[log_name]=, ?filter[date_from]=…).
        // Validation covers only the flat params; spatie handles its own parsing.
        $filters = $request->validate([
            'log_name' => ['nullable', 'string'],
            'event' => ['nullable', 'string'],
            'causer_id' => ['nullable'],
            'causer_type' => ['nullable', 'string'],
            'subject_id' => ['nullable'],
            'subject_type' => ['nullable', 'string'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'order' => ['nullable', 'in:asc,desc'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        // Only eager-load causer (the only relation exposed in the response).
        // `subject` is intentionally not loaded to avoid N+1 on heterogeneous morphs.
        $baseQuery = Activity::query()->with('causer');

        // Flat-param path (back-compat with /api/audit-log callers that predate
        // spatie/query-builder adoption on this endpoint).
        if (! empty($filters['log_name'])) {
            $baseQuery->where('log_name', $filters['log_name']);
        }

        if (! empty($filters['event'])) {
            $baseQuery->where('event', $filters['event']);
        }

        if (! empty($filters['causer_id'])) {
            $baseQuery->where('causer_id', $filters['causer_id']);
        }

        if (! empty($filters['causer_type'])) {
            $baseQuery->where('causer_type', $filters['causer_type']);
        }

        if (! empty($filters['subject_type'])) {
            $baseQuery->where('subject_type', $filters['subject_type']);
        }

        if (! empty($filters['subject_id'])) {
            $baseQuery->where('subject_id', $filters['subject_id']);
        }

        if (! empty($filters['from'])) {
            $baseQuery->where('created_at', '>=', $filters['from']);
        }

        if (! empty($filters['to'])) {
            $baseQuery->where('created_at', '<=', $filters['to']);
        }

        // Spatie-style nested filters: allow `filter[causer_id]=`, `filter[event]=`,
        // `filter[log_name]=`, `filter[subject_type]=`, `filter[subject_id]=`,
        // and the date range via `filter[date_from]` / `filter[date_to]`.
        $query = QueryBuilder::for($baseQuery, $request)
            ->allowedFilters(
                AllowedFilter::exact('log_name'),
                AllowedFilter::exact('event'),
                AllowedFilter::exact('causer_id'),
                AllowedFilter::exact('causer_type'),
                AllowedFilter::exact('subject_type'),
                AllowedFilter::exact('subject_id'),
                AllowedFilter::callback('date_from', function (Builder $q, string $value): void {
                    $q->where('created_at', '>=', $value);
                }),
                AllowedFilter::callback('date_to', function (Builder $q, string $value): void {
                    $q->where('created_at', '<=', $value);
                }),
            );

        $order = ($filters['order'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $paginator = $query->orderBy('created_at', $order)
            ->paginate((int) ($filters['per_page'] ?? 50));

        $data = $paginator->getCollection()->map(function (Activity $log): array {
            return [
                'id' => $log->id,
                'log_name' => $log->log_name,
                'event' => $log->event,
                'description' => $log->description,
                'causer_type' => $log->causer_type,
                'causer_id' => $log->causer_id,
                'causer' => $log->causer ? [
                    'id' => $log->causer->getKey(),
                    'name' => $log->causer->name ?? null,
                    'email' => $log->causer->email ?? null,
                ] : null,
                'subject_type' => $log->subject_type,
                'subject_id' => $log->subject_id,
                'properties' => $log->properties,
                'created_at' => $log->created_at,
            ];
        })->all();

        return $this->json([
            'data' => $data,
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }
}
