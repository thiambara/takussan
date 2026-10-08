<?php

namespace App\Services\Audit;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\User;
use App\Support\Audit\PropertyRedactor;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;

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

    /**
     * TCK-601 — `$agencyId` est l'agence du profil ACTIF, résolue par l'appelant HTTP et transmise
     * au job : l'exporteur ne lit jamais `request()`, qui est nul dans un worker (le fichier
     * asynchrone d'un admin multi-agences sortait vide).
     */
    public function count(User $user, array $filters, ?int $agencyId): int
    {
        return $this->baseQuery($user, $filters, $agencyId)->count();
    }

    /**
     * @return array{columns: list<string>, rows: list<array<string,mixed>>, filename: string}
     */
    public function buildPayload(User $user, array $filters, ?int $agencyId): array
    {
        $rows = $this->baseQuery($user, $filters, $agencyId)
            ->with(['causer', 'causer.platformProfile', 'causer.agencyAdminProfiles', 'causer.agentProfiles', 'causer.ownerProfiles'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Activity $log) => $this->mapRow($log))
            ->all();

        $from = $filters['date_from'] ?? now()->subDays(30)->toDateString();
        $to = $filters['date_to'] ?? now()->toDateString();
        $agencyName = $agencyId !== null && ! $user->isSuperAdmin() ? Agency::query()->whereKey($agencyId)->value('name') : null;
        $agency = $agencyName
            ? preg_replace('/[^a-z0-9]+/i', '-', strtolower($agencyName))
            : 'platform';
        $filename = "audit-trail-{$agency}-{$from}-{$to}";

        return [
            'columns' => self::COLUMNS,
            'rows' => $rows,
            'filename' => $filename,
        ];
    }

    private function baseQuery(User $user, array $filters, ?int $agencyId): Builder
    {
        $query = AuditScope::apply(Activity::query(), $user, $agencyId);
        $this->applyFilters($query, $filters);

        return $query;
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
        // TCK-601 (AC13b) — expurgé avant toute mise en forme : la colonne est un JSON libre.
        $props = collect(PropertyRedactor::redact($log->properties) ?? []);

        $hasAttributeDiff = $props->has('attributes') || $props->has('old');
        $changes = $hasAttributeDiff
            ? json_encode(['attributes' => $props->get('attributes'), 'old' => $props->get('old')])
            : ($props->isNotEmpty() ? $props->toJson() : null);

        return [
            'id' => $log->id,
            'logged_at' => $log->created_at?->toIso8601String(),
            'causer_email' => $causer?->email ?? 'system',
            'causer_role' => $causer?->profileTypes()->first() ?? 'system',
            'event' => $log->event,
            'subject_type' => $log->subject_type ? class_basename($log->subject_type) : null,
            'subject_id' => $log->subject_id,
            'description' => $log->description,
            'properties_diff' => $changes,
            'ip_address' => $props->get('ip'),
        ];
    }
}
