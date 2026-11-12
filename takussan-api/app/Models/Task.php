<?php

namespace App\Models;

use App\Jobs\SendTaskDueReminders;
use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\UserStatus;
use App\Policies\TaskPolicy;
use App\Services\Agency\AgentAvailability;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Sorts\TaskPrioritySort;
use App\Support\Http\ParametreUnique;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\SoftDeletingScope;
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

    // TCK-2595 — `assignedTo` : l'assigné sous le nom du contrat de la vue d'équipe (`{id, name}`).
    protected static array $requestLoadable = ['assignee', 'creator', 'assignedTo'];

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
     *
     * TCK-2595 — une LISTE séparée par des virgules (`filter[due]=overdue,today`) : l'union des
     * périodes, en une requête (la journée de l'agent). Une valeur inconnue dans la liste ne rend
     * rien d'elle. Le tableau (`filter[due][]=`) reste une valeur absente : rien (TCK-1407, ADR-0075).
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('due', function (Builder $query, mixed $value): void {
                $now = Carbon::now(self::DUE_TIMEZONE);
                $startOfDay = $now->copy()->startOfDay()->utc();
                $endOfDay = $now->copy()->endOfDay()->utc();

                // TCK-1407 (P151.06) — une liste (`filter[due][]=`) est une valeur inconnue : rien.
                $raw = ParametreUnique::valeur($value);
                $periods = $raw === null ? [] : array_values(array_unique(array_filter(array_map('trim', explode(',', $raw)), fn (string $p) => $p !== '')));

                $query->where(function (Builder $any) use ($periods, $startOfDay, $endOfDay): void {
                    $any->whereRaw('1 = 0');
                    foreach ($periods as $period) {
                        match ($period) {
                            'overdue' => $any->orWhere(fn (Builder $q) => $q->overdue()),
                            'today' => $any->orWhereBetween('due_at', [$startOfDay, $endOfDay]),
                            'upcoming' => $any->orWhere('due_at', '>', $endOfDay),
                            'none' => $any->orWhereNull('due_at'),
                            default => null,
                        };
                    }
                });
            })->delimiter(''),
            // TCK-2595 — `filter[team]=1` : la vue d'équipe. La PORTÉE est posée par
            // `TaskController::index` (elle remplace « mes tâches » et exige `crm.view_all`) ; le filtre
            // n'existe ici que pour être accepté par le constructeur de requête.
            AllowedFilter::callback('team', fn (Builder $query, mixed $value) => null),
            // TCK-1733 (P167.04) — `filter[assigned_to]=me` : les tâches qui me sont assignées dans
            // l'agence active, la portée que compte « Tâches du jour » (`DashboardAgentService`). Les
            // tâches closes restent, comme sous `filter[due]=today` (TCK-591). Toute autre valeur : rien.
            AllowedFilter::callback('assigned_to', function (Builder $query, mixed $value): void {
                $user = request()->user();
                // ADR-0075 § 2 — une liste vaut absente, donc pas `me` : aucune ligne, comme avant.
                if (ParametreUnique::valeur($value) !== 'me' || $user === null) {
                    $query->whereRaw('1 = 0');

                    return;
                }
                $query->where('assigned_to_id', $user->id)->parentInAgency($user->staffAgencyId());
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
     * TCK-591 (AC7), P198.01 (TCK-1910) — « en retard » : une tâche encore ouverte, échue avant le
     * début du jour dans le fuseau de l'agence. Une tâche due ce matin est « du jour », pas en
     * retard. Seule définition du mot : la liste (`filter[due]=overdue`), le tableau de bord de
     * l'agent et la performance d'équipe la lisent toutes trois.
     *
     * @param  Builder<Task>  $query
     * @return Builder<Task>
     */
    public function scopeOverdue(Builder $query): Builder
    {
        return $query->where('due_at', '<', Carbon::now(self::DUE_TIMEZONE)->startOfDay()->utc())
            ->whereIn('status', array_map(fn (TaskStatus $s) => $s->value, self::OPEN_STATUSES));
    }

    /**
     * P127.05 (TCK-1361), TCK-1733 (P167.04) — les tâches dont le parent (client, bien, ou réservation
     * pour une tâche de remboursement) est dans l'agence donnée, parent supprimé en douceur compris ;
     * sans agence, aucune borne. C'est la borne des tâches du tableau de bord de l'agent, et celle du
     * filtre `assigned_to=me` qui ouvre sa tuile « Tâches du jour » : les deux ne peuvent pas diverger.
     *
     * @param  Builder<Task>  $query
     * @return Builder<Task>
     */
    public function scopeParentInAgency(Builder $query, ?int $agencyId): Builder
    {
        return $agencyId === null ? $query
            : $query->whereHasMorph('taskable', [Customer::class, Property::class, Booking::class], fn (Builder $parent) => $parent
                ->withoutGlobalScope(SoftDeletingScope::class)->where('agency_id', $agencyId));
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

    /**
     * TCK-2595 — l'assigné est PERSONNEL ACTIF de l'agence : compte ni bloqué ni supprimé, profil
     * agent ou admin actif, ou délégation active de ces rôles. Forme SQL de
     * `PersonnelDeLAgence::estPersonnel()` sur l'assigné, que `TaskPolicy::readsAsTeam` juge par
     * ligne ; seule définition, lue par `filter[team]=1` et par {@see self::scopeLisiblesSurUnParentPar()}.
     *
     * @param  Builder<Task>  $query
     * @return Builder<Task>
     */
    public function scopeAssigneAuPersonnelActifDe(Builder $query, int $agencyId): Builder
    {
        $inAgency = fn (Builder $q) => $q->where('agency_id', $agencyId);
        $actif = fn (Builder $p) => $inAgency($p)->active();

        return $query->whereHas('assignee', fn (Builder $u) => $u
            ->whereNotIn('users.status', [UserStatus::Blocked->value, UserStatus::Deleted->value])
            ->where(fn (Builder $w) => $w
                ->whereHas('agentProfiles', $actif)
                ->orWhereHas('agencyAdminProfiles', $actif)
                ->orWhereHas('roleDelegations', fn (Builder $d) => $inAgency($d)
                    ->whereIn('role', [AgencyRoleBaseType::Agent->value, AgencyRoleBaseType::AgencyAdmin->value])
                    ->active())));
    }

    /**
     * TCK-2589 (contre-vérification de verif-commercial) — les tâches d'UN parent connu, dans l'agence
     * `$parentAgencyId` (null : parent hors agence), que `TaskPolicy::view` laisse ouvrir à `$user`,
     * en une clause SQL. Le fil et le journal d'une fiche n'en rendent pas d'autres : le bailleur
     * auteur lisait le titre de la tâche que l'admin s'était donnée sur sa fiche, que
     * `GET /api/tasks/{id}` lui refuse.
     *
     * Le parent étant fixé, les bornes d'agence de la policy (membre, personnel, absence couverte,
     * lecteur d'équipe) se jugent une fois pour la requête, jamais par ligne.
     *
     * @param  Builder<Task>  $query
     * @return Builder<Task>
     */
    public function scopeLisiblesSurUnParentPar(Builder $query, User $user, ?int $parentAgencyId): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $resolver = app(MembershipCapabilityResolver::class);
        // `participates` : créateur membre, assigné personnel de l'agence du parent.
        $createur = $parentAgencyId === null || $resolver->isMemberAt($user, $parentAgencyId);
        $assigne = $parentAgencyId === null || $resolver->isStaffAt($user, $parentAgencyId);
        // `coversAssignee` : les absents que l'appelant remplace dans cette agence.
        $absents = $parentAgencyId === null ? [] : app(AgentAvailability::class)->coveredBy($user)
            ->where('agency_id', $parentAgencyId)->pluck('absent_id')->all();
        // `readsAsTeam` : `crm.view_all` dans l'agence active, qui est celle du parent.
        $equipe = $parentAgencyId !== null && TaskPolicy::teamAgencyOf($user)?->id === $parentAgencyId;

        return $query->where(function (Builder $q) use ($user, $createur, $assigne, $absents, $equipe, $parentAgencyId) {
            $q->whereRaw('1 = 0')
                ->when($createur, fn (Builder $w) => $w->orWhere('created_by_id', $user->id))
                ->when($assigne, fn (Builder $w) => $w->orWhere('assigned_to_id', $user->id))
                ->when($absents !== [], fn (Builder $w) => $w->orWhereIn('assigned_to_id', $absents))
                ->when($equipe, fn (Builder $w) => $w->orWhere(fn (Builder $t) => $t->assigneAuPersonnelActifDe((int) $parentAgencyId)));
        });
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_id');
    }

    /** TCK-2595 — la même relation qu'`assignee`, sous le nom de `include=assignedTo`. */
    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
