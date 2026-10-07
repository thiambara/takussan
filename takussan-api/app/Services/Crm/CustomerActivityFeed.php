<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Task;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-591 — le journal d'une fiche client : le client lui-même, ses notes et ses tâches.
 *
 * L'onglet « Activité » de la console appelait `/api/audit-log`, réservé au super-admin et à
 * l'admin d'agence : pour un agent, 403 avalé en liste vide. Ce journal-ci s'autorise par la
 * lecture du client.
 *
 * Il ne rend que des CHANGEMENTS de champs nommés dans une liste blanche par sujet — jamais le
 * corps d'une note ni la description d'une tâche (ils ne sont d'ailleurs pas journalisés), jamais
 * la pièce d'identité du client. Le front en fait des phrases.
 */
class CustomerActivityFeed
{
    /** @var array<class-string, array{type: string, fields: list<string>}> */
    private const SUBJECTS = [
        Customer::class => [
            'type' => 'customer',
            'fields' => [
                'first_name', 'last_name', 'email', 'phone', 'occupation',
                'emergency_contact_name', 'emergency_contact_phone', 'status', 'pipeline_stage',
            ],
        ],
        CustomerNote::class => ['type' => 'note', 'fields' => ['pinned', 'kind']],
        Task::class => ['type' => 'task', 'fields' => ['title', 'status', 'due_at', 'priority', 'assigned_to_id']],
    ];

    public function paginate(Customer $customer, int $perPage = 20): LengthAwarePaginator
    {
        $noteIds = CustomerNote::withTrashed()->where('customer_id', $customer->id)->pluck('id');
        $taskIds = Task::withTrashed()
            ->where('taskable_type', Customer::class)
            ->where('taskable_id', $customer->id)
            ->pluck('id');

        return Activity::query()
            ->with('causer')
            ->where(function (Builder $q) use ($customer, $noteIds, $taskIds) {
                $q->where(fn (Builder $c) => $c->where('subject_type', Customer::class)->where('subject_id', $customer->id))
                    ->orWhere(fn (Builder $n) => $n->where('subject_type', CustomerNote::class)->whereIn('subject_id', $noteIds))
                    ->orWhere(fn (Builder $t) => $t->where('subject_type', Task::class)->whereIn('subject_id', $taskIds));
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min(max($perPage, 1), 100));
    }

    /**
     * @return array<string, mixed>
     */
    public function format(Activity $log): array
    {
        $subject = self::SUBJECTS[$log->subject_type] ?? ['type' => 'other', 'fields' => []];
        // activitylog v5 : les changements de champs vivent dans `attribute_changes`, plus dans
        // `properties`.
        $changes = $log->attribute_changes;
        $properties = $changes instanceof Collection ? $changes->toArray() : (array) ($changes ?? []);
        $keep = fn (?array $values) => $values === null
            ? null
            : array_intersect_key($values, array_flip($subject['fields']));

        $causer = $log->causer;

        return [
            'id' => $log->id,
            'subject' => $subject['type'],
            'subject_id' => $log->subject_id,
            'event' => $log->event,
            'changes' => [
                'attributes' => $keep($properties['attributes'] ?? null),
                'old' => $keep($properties['old'] ?? null),
            ],
            'causer' => $causer !== null && method_exists($causer, 'getFullNameAttribute')
                ? ['id' => $causer->getKey(), 'name' => $causer->getFullNameAttribute()]
                : null,
            'created_at' => $log->created_at?->toIso8601String(),
        ];
    }
}
