<?php

namespace App\Services\Audit;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Spatie\Activitylog\Models\Activity;

class ActivityLogExporter
{
    /** Columns emitted in every export. */
    private const COLUMNS = [
        'id',
        'logged_at',
        'causer_email',
        'causer_role',
        'event',
        'subject_type',
        'subject_id',
        'description',
        'properties_diff',
        'ip_address',
    ];

    public function count(User $user, array $filters): int
    {
        return $this->baseQuery($user, $filters)->count();
    }

    /**
     * @return array{columns: list<string>, rows: list<array<string,mixed>>, filename: string}
     */
    public function buildPayload(User $user, array $filters): array
    {
        $rows = $this->baseQuery($user, $filters)
            ->with(['causer', 'causer.roles'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Activity $log) => $this->mapRow($log))
            ->all();

        $from = $filters['date_from'] ?? now()->subDays(30)->toDateString();
        $to = $filters['date_to'] ?? now()->toDateString();
        $agency = $user->agency?->name
            ? preg_replace('/[^a-z0-9]+/i', '-', strtolower($user->agency->name))
            : 'platform';
        $filename = "audit-trail-{$agency}-{$from}-{$to}";

        return [
            'columns' => self::COLUMNS,
            'rows' => $rows,
            'filename' => $filename,
        ];
    }

    private function baseQuery(User $user, array $filters): Builder
    {
        $query = Activity::query();

        $this->scopeForUser($query, $user);
        $this->applyFilters($query, $filters);

        return $query;
    }

    private function scopeForUser(Builder $query, User $user): void
    {
        if ($user->hasRole('super_admin')) {
            return;
        }

        // agency_admin sees only logs whose causer belongs to their agency.
        $agencyId = $user->agency_id;
        if (! $agencyId) {
            $query->whereRaw('0 = 1');

            return;
        }

        // Use exact morph-class match + correlated subquery on user IDs.
        // Earlier revisions used `causer_type LIKE '%\Models\User'` which
        // was unreliable: MySQL's LIKE treats `\` as the escape character,
        // so the literal backslashes in the FQCN were eaten and the filter
        // matched nothing in production (SQLite test runs hid the bug).
        $query->where(function (Builder $q) use ($agencyId): void {
            $q->where('causer_type', User::class)
                ->whereIn(
                    'causer_id',
                    User::query()->where('agency_id', $agencyId)->select('id')
                );
        });
    }

    private function applyFilters(Builder $query, array $filters): void
    {
        if (! empty($filters['causer_id'])) {
            $query->where('causer_id', $filters['causer_id']);
        }

        $from = $filters['date_from'] ?? now()->subDays(30)->toDateString();
        $to = $filters['date_to'] ?? now()->toDateString();

        $query->where('created_at', '>=', Carbon::parse($from)->startOfDay());
        $query->where('created_at', '<=', Carbon::parse($to)->endOfDay());

        if (! empty($filters['event'])) {
            $query->where('event', $filters['event']);
        }

        if (! empty($filters['subject_type'])) {
            $query->where('subject_type', $filters['subject_type']);
        }

        if (! empty($filters['search'])) {
            $search = $filters['search'];
            $query->where('description', 'like', "%{$search}%");
        }
    }

    /**
     * @return array<string,mixed>
     */
    private function mapRow(Activity $log): array
    {
        $causer = $log->causer;
        $props = $log->properties ?? collect();

        $hasAttributeDiff = $props->has('attributes') || $props->has('old');
        $changes = $hasAttributeDiff
            ? json_encode(['attributes' => $props->get('attributes'), 'old' => $props->get('old')])
            : ($props->isNotEmpty() ? $props->toJson() : null);

        return [
            'id' => $log->id,
            'logged_at' => $log->created_at?->toIso8601String(),
            'causer_email' => $causer?->email ?? 'system',
            'causer_role' => $causer?->roles->first()?->name ?? 'system',
            'event' => $log->event,
            'subject_type' => $log->subject_type ? class_basename($log->subject_type) : null,
            'subject_id' => $log->subject_id,
            'description' => $log->description,
            'properties_diff' => $changes,
            'ip_address' => $props->get('ip'),
        ];
    }
}
