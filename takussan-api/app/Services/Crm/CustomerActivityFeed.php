<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerNoteKind;
use App\Models\PropertyContactLead;
use App\Models\Task;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-591 — le journal d'une fiche client : le client lui-même, ses notes et ses tâches.
 *
 * TCK-2578 — et ses comptes rendus de visite (notes `visit_report`), pour le seul personnel.
 *
 * TCK-2583 — et ses gestes de contact (`event = contacted`, `channel`), y compris ceux posés sur la
 * demande de contact qu'elle a convertie : une ligne « WhatsApp », « Appel »… Jamais de coordonnée.
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
        // TCK-2583 — d'une demande convertie, seuls ses gestes de contact entrent dans le journal.
        PropertyContactLead::class => ['type' => 'lead', 'fields' => []],
        Task::class => ['type' => 'task', 'fields' => ['title', 'status', 'due_at', 'priority', 'assigned_to_id']],
    ];

    /**
     * Les comptes rendus de visite détaillés dans la page, par identifiant de note (TCK-2578).
     *
     * @var array<int, array{visit_id: int, property_id: ?int, outcome: ?string, objections: list<string>, follow_up: ?string}>
     */
    private array $reports = [];

    /**
     * TCK-2578 (ADR-0101 § 2) — `$withVisitReports` : le lecteur est-il du personnel de l'agence
     * (`CustomerPolicy::viewVisitReports`) ? Sinon les notes `visit_report` sortent de la requête
     * elle-même, et le total ne les compte pas. Fermé par défaut.
     */
    public function paginate(Customer $customer, int $perPage = 20, bool $withVisitReports = false): LengthAwarePaginator
    {
        $noteIds = CustomerNote::withTrashed()
            ->where('customer_id', $customer->id)
            ->when(! $withVisitReports, fn (Builder $q) => $q->withoutVisitReports())
            ->pluck('id');
        $taskIds = Task::withTrashed()
            ->where('taskable_type', Customer::class)
            ->where('taskable_id', $customer->id)
            ->pluck('id');
        $leadIds = PropertyContactLead::query()->where('customer_id', $customer->id)->pluck('id');

        $paginator = Activity::query()
            ->with('causer')
            ->where(function (Builder $q) use ($customer, $noteIds, $taskIds, $leadIds) {
                $q->where(fn (Builder $c) => $c->where('subject_type', Customer::class)->where('subject_id', $customer->id))
                    ->orWhere(fn (Builder $n) => $n->where('subject_type', CustomerNote::class)->whereIn('subject_id', $noteIds))
                    ->orWhere(fn (Builder $t) => $t->where('subject_type', Task::class)->whereIn('subject_id', $taskIds))
                    ->orWhere(fn (Builder $l) => $l->where('subject_type', PropertyContactLead::class)
                        ->whereIn('subject_id', $leadIds)
                        ->where('event', ContactGestureService::EVENT));
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min(max($perPage, 1), 100));

        if ($withVisitReports) {
            $this->loadReports($paginator->getCollection());
        }

        return $paginator;
    }

    /**
     * TCK-2578 — une entrée par compte rendu : la création de sa note `visit_report` (les
     * réécritures ne sont pas journalisées), enrichie du verdict, des objections et de la suite
     * COURANTS de la visite. Jamais la note libre. En une requête pour la page.
     *
     * @param  Collection<int, Activity>  $logs
     */
    private function loadReports(Collection $logs): void
    {
        $noteIds = $logs->where('subject_type', CustomerNote::class)->pluck('subject_id')->unique()->values();
        if ($noteIds->isEmpty()) {
            return;
        }

        CustomerNote::withTrashed()
            ->whereIn('id', $noteIds)
            ->where('kind', CustomerNoteKind::VisitReport->value)
            ->whereNotNull('property_visit_id')
            ->with('visit')
            ->get()
            ->each(function (CustomerNote $note): void {
                $visit = $note->visit;
                if ($visit === null) {
                    return;
                }
                $this->reports[(int) $note->id] = [
                    'visit_id' => (int) $visit->id,
                    'property_id' => $visit->property_id !== null ? (int) $visit->property_id : null,
                    'outcome' => $visit->report_outcome?->value,
                    'objections' => array_values($visit->report_objections ?? []),
                    'follow_up' => $visit->report_follow_up?->value,
                ];
            });
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
            // TCK-2583 — le canal d'un geste de contact, rien d'autre de ses propriétés.
            ...($log->event === ContactGestureService::EVENT
                ? ['channel' => $log->properties instanceof Collection ? $log->properties->get('channel') : null]
                : []),
            ...($subject['type'] === 'note' && isset($this->reports[(int) $log->subject_id])
                ? ['report' => $this->reports[(int) $log->subject_id]]
                : []),
        ];
    }
}
