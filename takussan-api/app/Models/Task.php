<?php

namespace App\Models;

use App\Jobs\SendTaskDueReminders;
use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Sorts\TaskPrioritySort;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\Support\LogOptions;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\AllowedSort;

class Task extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes;

    /**
     * TCK-591 — le fuseau des échéances : « aujourd'hui » est celui de l'agent, pas celui du serveur.
     */
    public const DUE_TIMEZONE = 'Africa/Dakar';

    /** Les états d'une tâche qui reste à faire : une tâche close n'est jamais « en retard ». */
    public const OPEN_STATUSES = [TaskStatus::Open, TaskStatus::InProgress];

    /**
     * TCK-1529 (P169.02) — la marque de {@see SendTaskDueReminders} vaut pour l'échéance
     * et l'assigné qu'elle a rappelés : quand `due_at` ou `assigned_to_id` change, elle tombe, et la
     * tâche est rappelée de nouveau, 24 h avant son échéance, à qui la tient alors (TCK-083).
     */
    public const REMINDER_MARKER = 'reminder_24h_sent_at';

    protected static function booted(): void
    {
        static::updating(function (Task $task) {
            if (! $task->isDirty(['due_at', 'assigned_to_id'])) {
                return;
            }
            $metadata = $task->metadata ?? [];
            if (array_key_exists(self::REMINDER_MARKER, $metadata)) {
                unset($metadata[self::REMINDER_MARKER]);
                $task->metadata = $metadata;
            }
        });
    }

    /**
     * TCK-591 — la tâche entre au journal pour que la fiche client dise « tâche créée », mais
     * sans sa description : le journal dit qu'une chose a eu lieu, pas ce qu'elle contient.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'title', 'taskable_id', 'taskable_type', 'assigned_to_id', 'created_by_id',
                'due_at', 'completed_at', 'status', 'priority',
            ])
            ->logOnlyDirty()
            ->dontLogEmptyChanges()
            ->useLogName(class_basename(static::class));
    }

    protected $fillable = [
        'title', 'description', 'taskable_id', 'taskable_type',
        'assigned_to_id', 'created_by_id', 'due_at', 'completed_at',
        'status', 'priority', 'metadata',
    ];

    protected $casts = [
        'status' => TaskStatus::class,
        'priority' => TaskPriority::class,
        'due_at' => 'datetime',
        'completed_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['taskable_id', 'taskable_type', 'assigned_to_id', 'created_by_id', 'status', 'priority'];

    // `priority` se trie par rang : voir `customQuerySorts()`.
    protected static array $requestSortable = ['id', 'created_at', 'due_at', 'status'];

    /**
     * TCK-1302 (P134.03) — `sort=priority` trie sur le rang de {@see TaskPriority} (TCK-1260), et non
     * sur la chaîne.
     *
     * @return array<int, AllowedSort>
     */
    protected static function customQuerySorts(): array
    {
        return [AllowedSort::custom('priority', new TaskPrioritySort)];
    }

    protected static array $requestLoadable = ['assignee', 'creator'];

    protected static array $queryFields = [
        'id', 'title', 'taskable_id', 'taskable_type',
        'assigned_to_id', 'created_by_id', 'due_at', 'completed_at',
        'status', 'priority', 'created_at', 'updated_at',
    ];

    /**
     * TCK-591 — `filter[due]=overdue|today|upcoming|none`, jugé dans le fuseau de l'agence.
     *
     * `overdue` ne retient que les tâches encore ouvertes : une tâche faite hier n'est pas en retard.
     * `today` et `upcoming` gardent les tâches closes, pour que cocher ne fasse pas disparaître la
     * ligne de la journée.
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('due', function (Builder $query, mixed $value): void {
                $now = Carbon::now(self::DUE_TIMEZONE);
                $startOfDay = $now->copy()->startOfDay()->utc();
                $endOfDay = $now->copy()->endOfDay()->utc();

                // TCK-1407 (P151.06) — une liste (`filter[due][]=`) est une valeur inconnue : rien.
                match (is_string($value) ? $value : null) {
                    'overdue' => $query->where('due_at', '<', $startOfDay)
                        ->whereIn('status', array_map(fn (TaskStatus $s) => $s->value, self::OPEN_STATUSES)),
                    'today' => $query->whereBetween('due_at', [$startOfDay, $endOfDay]),
                    'upcoming' => $query->where('due_at', '>', $endOfDay),
                    'none' => $query->whereNull('due_at'),
                    default => $query->whereRaw('1 = 0'),
                };
            }),
        ];
    }

    public function taskable(): MorphTo
    {
        return $this->morphTo();
    }

    /** L'agence du parent (client ou bien) : c'est elle qui dit à quelle équipe la tâche appartient. */
    public function parentAgencyId(): ?int
    {
        $agencyId = $this->parentRecord()?->getAttribute('agency_id');

        return $agencyId !== null ? (int) $agencyId : null;
    }

    /**
     * TCK-591 (verif-591 passe 2, N1) — un parent attendu (`taskable_type` posé) qu'on ne retrouve
     * plus, même parmi les supprimés. `TaskPolicy` en fait un refus, jamais un « hors agence ».
     */
    public function parentIsMissing(): bool
    {
        return $this->taskable_type !== null && $this->parentRecord() === null;
    }

    /**
     * Le parent, supprimés compris. `taskable` (`morphTo`) ne voit pas un client ou un bien supprimé :
     * son agence valait `null`, et la règle « parent hors agence » rendait la tâche à l'agent retiré.
     */
    private function parentRecord(): ?Model
    {
        if ($this->taskable_type === null || $this->taskable_id === null) {
            return null;
        }

        /** @var class-string<Model> $class */
        $class = Relation::getMorphedModel($this->taskable_type) ?? $this->taskable_type;
        if (! class_exists($class)) {
            return null;
        }

        $query = $class::query();
        if (in_array(SoftDeletes::class, class_uses_recursive($class), true)) {
            $query->withTrashed();
        }

        return $query->find($this->taskable_id);
    }

    /**
     * TCK-591 (verif-591 B1) — les tâches dont le parent est hors de toute agence, ou dans l'une des
     * agences données. Forme SQL de la borne que `TaskPolicy::view` applique à une ligne.
     *
     * @param  Builder<Task>  $query
     * @param  list<int>  $agencyIds
     * @return Builder<Task>
     */
    public function scopeParentAgencyIn(Builder $query, array $agencyIds): Builder
    {
        return $query->where(function (Builder $q) use ($agencyIds) {
            $q->whereNull('taskable_type')
                ->orWhereHasMorph('taskable', [Customer::class, Property::class], fn (Builder $parent) => $parent
                    ->where(fn (Builder $w) => $w->whereNull('agency_id')->orWhereIn('agency_id', $agencyIds)));
        });
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
