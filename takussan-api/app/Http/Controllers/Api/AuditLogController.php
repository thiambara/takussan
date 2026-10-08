<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Filters\ExactIdentifierFilter;
use App\Http\Requests\Api\IndexAuditLogRequest;
use App\Models\Activity;
use App\Services\Audit\AuditScope;
use App\Support\AgencyKindGuard;
use App\Support\Audit\PropertyRedactor;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

class AuditLogController extends Controller
{
    public function indexByEntity(Request $request, string $entity, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            $user->isSuperAdmin() || ($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id)),
            403
        );
        AgencyKindGuard::ensureStandardForNonGlobal(
            $user,
            $request->activeProfile()?->agency_id ?? $user->agency_id,
        );

        // TCK-601 (AD9) — le type est résolu en CLASSE EXACTE. L'ancien `subject_type LIKE
        // '%<Entity>'` attrapait aussi `PlatformPayout` pour `payout`, et aucun filtre d'agence ne
        // bornait la lecture : l'historique d'un objet de n'importe quelle agence se lisait en
        // changeant l'identifiant. `Str::studly` traite les slugs composés (`booking_payment`).
        $class = 'App\\Models\\'.Str::studly($entity);
        abort_unless(
            preg_match('/^[a-z][a-z0-9_-]*$/i', $entity) === 1
            && class_exists($class) && is_subclass_of($class, Model::class)
            && ! (new \ReflectionClass($class))->isAbstract(),
            404,
        );

        $query = AuditScope::apply(
            Activity::query()->with('causer'),
            $user,
            $request->activeProfile()?->agency_id ?? $user->agency_id,
        )
            ->where('subject_type', (new $class)->getMorphClass())
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
                'properties' => PropertyRedactor::redact($log->properties),
                'created_at' => $log->created_at,
            ])->all(),
            'meta' => $this->paginationMeta($paginator),
        ]);
    }

    public function index(IndexAuditLogRequest $request): JsonResponse
    {
        // TCK-305 — l'autorisation court dans IndexAuditLogRequest::authorize(), donc AVANT la
        // validation : un appel non autorisé ET mal formé doit rendre 403, pas 422.
        $authedUser = $request->user();
        // TCK-104 — `agency_admin` can browse the audit dashboard scoped
        // to their own agency. `admin` is preserved for legacy clients.
        AgencyKindGuard::ensureStandardForNonGlobal(
            $authedUser,
            $request->activeProfile()?->agency_id ?? $authedUser->agency_id,
        );

        // Accept legacy flat params (?log_name=, ?event=, ?from=, ?to=, ?causer_id=…)
        // AND spatie-style nested filters (?filter[log_name]=, ?filter[date_from]=…).
        // Validation covers only the flat params; spatie handles its own parsing.
        $filters = $request->validated();

        // Only eager-load causer (the only relation exposed in the response).
        // `subject` is intentionally not loaded to avoid N+1 on heterogeneous morphs.
        $baseQuery = Activity::query()->with('causer');

        // TCK-601 (ADR-0044 §3) — un admin d'agence voit les lignes rattachées à l'agence de son
        // profil actif, quel qu'en soit l'acteur (un admin, le système, un webhook), et aucune autre.
        // Le filtre de TCK-104 portait sur l'ACTEUR : il cachait les actes des admins et laissait
        // passer, chez A, tout ce qu'un bailleur de A et de B faisait chez B.
        AuditScope::apply($baseQuery, $authedUser, $request->activeProfile()?->agency_id ?? $authedUser->agency_id);

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
            $baseQuery->where('created_at', '>=', $this->normalizeRangeBoundary($filters['from'], false));
        }

        if (! empty($filters['to'])) {
            $baseQuery->where('created_at', '<=', $this->normalizeRangeBoundary($filters['to'], true));
        }

        // Spatie-style nested filters: allow `filter[causer_id]=`, `filter[event]=`,
        // `filter[log_name]=`, `filter[subject_type]=`, `filter[subject_id]=`,
        // and the date range via `filter[date_from]` / `filter[date_to]`.
        $query = QueryBuilder::for($baseQuery, $request)
            ->allowedFilters(
                AllowedFilter::exact('log_name'),
                AllowedFilter::exact('event'),
                AllowedFilter::custom('causer_id', new ExactIdentifierFilter),
                AllowedFilter::exact('causer_type'),
                AllowedFilter::exact('subject_type'),
                AllowedFilter::custom('subject_id', new ExactIdentifierFilter),
                AllowedFilter::callback('date_from', function (Builder $q, string $value): void {
                    $q->where('created_at', '>=', $this->normalizeRangeBoundary($value, false));
                }),
                AllowedFilter::callback('date_to', function (Builder $q, string $value): void {
                    $q->where('created_at', '<=', $this->normalizeRangeBoundary($value, true));
                }),
                AllowedFilter::callback('search', function (Builder $q, string $value): void {
                    $q->where('description', 'like', '%'.$value.'%');
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
                'properties' => PropertyRedactor::redact($log->properties),
                'created_at' => $log->created_at,
            ];
        })->all();

        return $this->paginated($paginator, $data);
    }

    /**
     * Normalize a date-range boundary so date-only inputs cover the full day.
     *
     * `?to=2026-04-22` would otherwise compile to `created_at <= 2026-04-22 00:00:00`
     * and silently drop every row from that day. When the caller passes a
     * date-only value (no time component), expand it to start/end-of-day based
     * on whether it is a lower or upper bound. Full datetimes pass through.
     */
    private function normalizeRangeBoundary(string $value, bool $isUpperBound): string
    {
        $parsed = Carbon::parse($value);

        if (! str_contains($value, ':')) {
            return ($isUpperBound ? $parsed->endOfDay() : $parsed->startOfDay())->toDateTimeString();
        }

        return $parsed->toDateTimeString();
    }
}
