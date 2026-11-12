<?php

namespace App\Services\Crm;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerNoteKind;
use App\Models\Enums\TaskStatus;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Services\Visit\VisitesLisibles;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-2589 (ADR-0101 § 1) — le FIL de la fiche client : ses notes (avec leur corps), ses visites,
 * ses gestes de contact et ses changements d'étape, mêlés dans le temps et paginés côté serveur.
 *
 * Trois tables, une page : une union `(type, rang, id, occurs_at)` triée par date, puis par type,
 * puis par identifiant — un ordre TOTAL, deux entrées du même instant ne changent pas de page d'une
 * lecture à l'autre. Chaque type est ensuite relu en une requête pour la page.
 *
 * Ce que le lecteur reçoit n'est jamais plus que ce que lui rendent les routes de chaque source :
 *  · les notes de `GET …/notes` — sans les notes réservées au personnel (`visit_report`,
 *    `lead_message`) hors personnel de l'agence de la fiche ;
 *  · les visites au seul personnel de l'agence de la fiche (comme `upcoming_visits`), et parmi
 *    elles celles que `GET /api/property-visits` lui rend (`VisitesLisibles`) — leur statut, leur
 *    date et le titre du bien, jamais leurs notes ni le visiteur ;
 *  · les gestes de contact au seul personnel de l'agence de la fiche — un geste de l'agence, pas
 *    un fait de la fiche : le bailleur auteur lit sa fiche, pas qui l'agence a appelé ;
 *  · les changements d'étape de `GET …/activity` ;
 *  · (vérification C/C2, d1 a) la vie de la fiche et de ses tâches, que l'onglet « Activité » retiré
 *    portait seul : la création de la fiche, les modifications de son identité et de son contact
 *    (les seuls NOMS des champs de {@see self::CHAMPS_DE_LA_FICHE}, jamais leurs valeurs), la
 *    création d'une tâche et son passage à « faite ». Même lecture que `GET …/activity`
 *    (`CustomerActivityFeed`) : tout lecteur de la fiche, aucun geste de l'agence (TCK-2754) —
 *    seuls les événements `created`/`updated` entrent, jamais `contacted` ni « Plus tard ».
 *
 * `$staff` est `CustomerPolicy::viewVisitReports` : le personnel de l'agence de la fiche.
 */
final class CustomerTimeline
{
    public const TYPES = ['note', 'visit', 'contact', 'stage', 'record', 'task'];

    /**
     * Les champs dont la modification entre au fil (`record`) : ceux du journal
     * (`CustomerActivityFeed`) hors étape, qui a son type. Ni la pièce d'identité, ni les liens
     * (`user_id`, `agency_id`, `added_by_id`) : une mise à jour qui ne touche qu'eux n'entre pas.
     */
    public const CHAMPS_DE_LA_FICHE = [
        'first_name', 'last_name', 'email', 'phone', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone', 'status',
    ];

    /** Les jalons d'une visite qui entrent au fil (TCK-2589, décision 7a). */
    public const JALONS = ['created', 'confirmed', 'cancelled'];

    /**
     * Le départage d'un même instant : stable, et le même d'une page à l'autre. Les jalons d'une
     * visite vont du plus avancé au premier, comme le fil va du plus récent au plus ancien.
     */
    private const RANGS = [
        'note' => 1,
        'visit.cancelled' => 2,
        'visit.confirmed' => 3,
        'visit.created' => 4,
        'contact' => 5,
        'stage' => 6,
        'task.done' => 7,
        'task.created' => 8,
        'record.updated' => 9,
        'record.created' => 10,
    ];

    /**
     * Une visite confirmée dans cet intervalle après sa création a été CRÉÉE confirmée (planifiée
     * par l'agence) : personne ne l'a demandée, le fil ne montre que sa confirmation.
     */
    private const CREEE_CONFIRMEE_SECONDES = 5;

    /**
     * @param  list<string>  $types  sous-ensemble de {@see self::TYPES} ; vide = tous
     */
    public function paginate(Customer $customer, User $reader, bool $staff, array $types, int $perPage, int $page = 1): LengthAwarePaginator
    {
        $types = $types === [] ? self::TYPES : array_values(array_intersect(self::TYPES, $types));

        $sources = array_values(array_filter([
            in_array('note', $types, true) ? $this->notes($customer, $staff) : null,
            ...(in_array('visit', $types, true) && $staff ? $this->visits($customer, $reader) : []),
            in_array('contact', $types, true) && $staff ? $this->contacts($customer) : null,
            in_array('stage', $types, true) ? $this->stages($customer) : null,
            ...(in_array('record', $types, true) ? $this->records($customer) : []),
            ...(in_array('task', $types, true) ? $this->tasks($customer) : []),
        ]));

        $perPage = min(max($perPage, 1), 100);
        if ($sources === []) {
            return new LengthAwarePaginator([], 0, $perPage, $page);
        }

        $union = array_shift($sources);
        foreach ($sources as $source) {
            $union->unionAll($source);
        }

        $paginator = DB::query()
            ->fromSub($union, 'fil')
            ->orderByDesc('occurs_at')
            ->orderBy('rang')
            ->orderByDesc('id')
            ->paginate($perPage, ['*'], 'page', $page);

        $paginator->setCollection($this->hydrate(collect($paginator->items()), $staff));

        return $paginator;
    }

    private function notes(Customer $customer, bool $staff): QueryBuilder
    {
        return CustomerNote::query()
            ->where('customer_id', $customer->id)
            ->when(! $staff, fn ($q) => $q->withoutVisitReports())
            ->toBase()
            ->select([DB::raw("'note' as type"), DB::raw(self::RANGS['note'].' as rang'), 'customer_notes.id', 'customer_notes.created_at as occurs_at', DB::raw('NULL as jalon')]);
    }

    /**
     * Trois sélections, une par jalon, sous la MÊME règle de lecture (`VisitesLisibles`) : la
     * demande (création), la confirmation et l'annulation. La fin d'une visite est portée par son
     * compte rendu, une note du fil.
     *
     * @return list<QueryBuilder>
     */
    private function visits(Customer $customer, User $reader): array
    {
        $jalon = fn (string $nom, string $colonne) => VisitesLisibles::pour($reader)
            ->where('property_visits.customer_id', $customer->id)
            ->whereNotNull("property_visits.{$colonne}")
            ->toBase()
            ->select([
                DB::raw("'visit' as type"),
                DB::raw(self::RANGS["visit.{$nom}"].' as rang'),
                'property_visits.id',
                "property_visits.{$colonne} as occurs_at",
                DB::raw("'{$nom}' as jalon"),
            ]);

        return [
            $jalon('created', 'created_at')->where(fn ($q) => $q
                ->whereNull('property_visits.confirmed_at')
                ->orWhereRaw("property_visits.confirmed_at > property_visits.created_at + interval '".self::CREEE_CONFIRMEE_SECONDES." seconds'")),
            $jalon('confirmed', 'confirmed_at'),
            $jalon('cancelled', 'cancelled_at'),
        ];
    }

    private function contacts(Customer $customer): QueryBuilder
    {
        $leadIds = PropertyContactLead::query()->where('customer_id', $customer->id)->select('id');

        return Activity::query()
            ->where('event', ContactGestureService::EVENT)
            ->where(fn ($q) => $q
                ->where(fn ($c) => $c->where('subject_type', Customer::class)->where('subject_id', $customer->id))
                ->orWhere(fn ($l) => $l->where('subject_type', PropertyContactLead::class)->whereIn('subject_id', $leadIds)))
            ->toBase()
            ->select([DB::raw("'contact' as type"), DB::raw(self::RANGS['contact'].' as rang'), 'activity_log.id', 'activity_log.created_at as occurs_at', DB::raw('NULL as jalon')]);
    }

    private function stages(Customer $customer): QueryBuilder
    {
        return Activity::query()
            ->where('subject_type', Customer::class)
            ->where('subject_id', $customer->id)
            ->where('event', 'updated')
            ->whereNotNull('attribute_changes->attributes->pipeline_stage')
            ->toBase()
            ->select([DB::raw("'stage' as type"), DB::raw(self::RANGS['stage'].' as rang'), 'activity_log.id', 'activity_log.created_at as occurs_at', DB::raw('NULL as jalon')]);
    }

    /**
     * La création de la fiche, et chaque modification d'au moins un champ de
     * {@see self::CHAMPS_DE_LA_FICHE} — par la CLÉ du champ dans les changements, pas sa valeur : un
     * e-mail effacé (passé à `null`) est une modification.
     *
     * @return list<QueryBuilder>
     */
    private function records(Customer $customer): array
    {
        $journal = fn (string $jalon) => Activity::query()
            ->where('subject_type', Customer::class)
            ->where('subject_id', $customer->id)
            ->where('event', $jalon)
            ->toBase()
            ->select([DB::raw("'record' as type"), DB::raw(self::RANGS["record.{$jalon}"].' as rang'), 'activity_log.id', 'activity_log.created_at as occurs_at', DB::raw("'{$jalon}' as jalon")]);

        return [
            $journal('created'),
            $journal('updated')->where(function ($q) {
                foreach (self::CHAMPS_DE_LA_FICHE as $champ) {
                    $q->orWhereRaw("jsonb_exists(activity_log.attribute_changes::jsonb -> 'attributes', ?)", [$champ]);
                }
            }),
        ];
    }

    /**
     * Les tâches de la fiche (supprimées comprises, comme le journal) : leur création, et leur
     * passage à « faite ».
     *
     * @return list<QueryBuilder>
     */
    private function tasks(Customer $customer): array
    {
        $taskIds = Task::withTrashed()
            ->where('taskable_type', Customer::class)
            ->where('taskable_id', $customer->id)
            ->select('id');
        $journal = fn (string $jalon) => Activity::query()
            ->where('subject_type', Task::class)
            ->whereIn('subject_id', $taskIds)
            ->toBase()
            ->select([DB::raw("'task' as type"), DB::raw(self::RANGS["task.{$jalon}"].' as rang'), 'activity_log.id', 'activity_log.created_at as occurs_at', DB::raw("'{$jalon}' as jalon")]);

        return [
            $journal('created')->where('event', 'created'),
            $journal('done')->where('event', 'updated')->where('attribute_changes->attributes->status', TaskStatus::Done->value),
        ];
    }

    /**
     * Une requête par type présent dans la page, jamais une par ligne.
     *
     * @param  Collection<int, object{type: string, id: int|string, occurs_at: mixed, jalon: ?string}>  $rows
     * @return Collection<int, array<string, mixed>>
     */
    private function hydrate(Collection $rows, bool $staff): Collection
    {
        $ids = fn (string $type) => $rows->where('type', $type)->pluck('id')->map(fn ($id) => (int) $id)->all();

        $notes = CustomerNote::query()->with(['author', ...($staff ? ['visit'] : [])])->whereKey($ids('note'))->get()->keyBy('id');
        $visits = PropertyVisit::query()
            ->with(['property' => fn ($p) => $p->withTrashed()->select(['id', 'title'])])
            ->whereKey($ids('visit'))
            ->get(['id', 'property_id', 'status', 'scheduled_at', 'created_at', 'confirmed_at', 'cancelled_at'])
            ->keyBy('id');
        $logs = Activity::query()->with('causer')->whereKey([...$ids('contact'), ...$ids('stage'), ...$ids('record'), ...$ids('task')])->get()->keyBy('id');
        // Le titre COURANT de la tâche (celui du journal n'est écrit qu'à la création et au renommage).
        $taches = Task::withTrashed()
            ->whereKey($logs->where('subject_type', Task::class)->pluck('subject_id')->unique()->values()->all())
            ->get(['id', 'title'])
            ->keyBy('id');

        return $rows->map(function (object $row) use ($notes, $visits, $logs, $taches, $staff): ?array {
            $id = (int) $row->id;

            return match ($row->type) {
                'note' => isset($notes[$id]) ? $this->note($notes[$id], $staff) : null,
                'visit' => isset($visits[$id]) ? $this->visit($visits[$id], (string) $row->jalon) : null,
                'contact' => isset($logs[$id]) ? $this->contact($logs[$id]) : null,
                'stage' => isset($logs[$id]) ? $this->stage($logs[$id]) : null,
                'record' => isset($logs[$id]) ? $this->record($logs[$id], (string) $row->jalon) : null,
                'task' => isset($logs[$id]) ? $this->task($logs[$id], (string) $row->jalon, $taches) : null,
                default => null,
            };
        })->filter()->values();
    }

    /** @return array<string, mixed> */
    private function note(CustomerNote $note, bool $staff): array
    {
        $visit = $staff && $note->kind === CustomerNoteKind::VisitReport ? $note->visit : null;

        return [
            'type' => 'note',
            'id' => $note->id,
            'at' => BaseResource::instantOnWire($note->created_at),
            'kind' => $note->kind?->value,
            'body' => $note->body,
            'pinned' => (bool) $note->pinned,
            'property_visit_id' => $note->property_visit_id,
            'author' => $this->personne($note->author),
            // TCK-2578 — le verdict, les objections et la suite COURANTS du compte rendu, au seul
            // personnel, comme le journal ; jamais la note libre de la visite.
            ...($visit !== null ? ['report' => [
                'visit_id' => (int) $visit->id,
                'outcome' => $visit->report_outcome?->value,
                'objections' => array_values($visit->report_objections ?? []),
                'follow_up' => $visit->report_follow_up?->value,
            ]] : []),
        ];
    }

    /** @return array<string, mixed> */
    private function visit(PropertyVisit $visit, string $jalon): array
    {
        $at = match ($jalon) {
            'confirmed' => $visit->confirmed_at,
            'cancelled' => $visit->cancelled_at,
            default => $visit->created_at,
        };

        return [
            'type' => 'visit',
            'id' => $visit->id,
            'milestone' => $jalon,
            'at' => BaseResource::instantOnWire($at),
            // Le statut COURANT de la visite : le jalon dit ce qui s'est passé à `at`.
            'status' => $visit->status?->value,
            'scheduled_at' => BaseResource::instantOnWire($visit->scheduled_at),
            'property' => $visit->property !== null ? ['id' => $visit->property->id, 'title' => $visit->property->title] : null,
        ];
    }

    /** @return array<string, mixed> */
    private function contact(Activity $log): array
    {
        return [
            'type' => 'contact',
            'id' => $log->id,
            'at' => BaseResource::instantOnWire($log->created_at),
            'channel' => $log->properties instanceof Collection ? $log->properties->get('channel') : null,
            // TCK-2589 (1a) — où le geste a été posé : sur la demande d'où vient la fiche (une
            // réponse) ou sur la fiche elle-même.
            'on' => $log->subject_type === PropertyContactLead::class ? 'lead' : 'customer',
            'causer' => $this->personne($log->causer),
        ];
    }

    /** @return array<string, mixed> */
    private function stage(Activity $log): array
    {
        $changes = $log->attribute_changes;
        $changes = $changes instanceof Collection ? $changes->toArray() : (array) ($changes ?? []);

        return [
            'type' => 'stage',
            'id' => $log->id,
            'at' => BaseResource::instantOnWire($log->created_at),
            'from' => $changes['old']['pipeline_stage'] ?? null,
            'to' => $changes['attributes']['pipeline_stage'] ?? null,
            'causer' => $this->personne($log->causer),
        ];
    }

    /** @return array<string, mixed> */
    private function record(Activity $log, string $jalon): array
    {
        $changes = $log->attribute_changes;
        $changes = $changes instanceof Collection ? $changes->toArray() : (array) ($changes ?? []);
        $changes = (array) ($changes['attributes'] ?? []);

        return [
            'type' => 'record',
            'id' => $log->id,
            'milestone' => $jalon,
            'at' => BaseResource::instantOnWire($log->created_at),
            // Les NOMS des champs modifiés, dans l'ordre de la liste ; aucune valeur.
            'fields' => $jalon === 'updated'
                ? array_values(array_filter(self::CHAMPS_DE_LA_FICHE, fn (string $champ) => array_key_exists($champ, $changes)))
                : [],
            'causer' => $this->personne($log->causer),
        ];
    }

    /**
     * @param  Collection<int, Task>  $taches
     * @return array<string, mixed>
     */
    private function task(Activity $log, string $jalon, Collection $taches): array
    {
        $tache = $taches->get((int) $log->subject_id);

        return [
            'type' => 'task',
            'id' => $log->id,
            'milestone' => $jalon,
            'at' => BaseResource::instantOnWire($log->created_at),
            'task' => $tache !== null ? ['id' => (int) $tache->id, 'title' => $tache->title] : null,
            'causer' => $this->personne($log->causer),
        ];
    }

    /** @return array{id: int, name: string}|null */
    private function personne(mixed $user): ?array
    {
        return $user instanceof User ? ['id' => (int) $user->id, 'name' => $user->getFullNameAttribute()] : null;
    }
}
