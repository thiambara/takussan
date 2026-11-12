<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreTaskRequest;
use App\Http\Requests\Api\UpdateTaskRequest;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Policies\TaskPolicy;
use App\Rules\PersonnelDeLAgence;
use App\Services\Agency\AgentAvailability;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Media\WatermarkRequirement;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Support\Http\ParametreUnique;
use App\Support\TelephoneSaisi;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // TCK-2595 — l'adresse et la photo d'un bien parent (`taskable.subtitle`, `cover_url`).
        $base = Task::query()->with(['assignee', 'creator', 'taskable' => fn (MorphTo $parent) => $parent
            ->morphWith([Property::class => ['address', 'media']])]);

        if (filter_var(ParametreUnique::valeur($request->input('filter.team')), FILTER_VALIDATE_BOOLEAN)) {
            $this->teamScope($base, $user);
        } elseif (! $user->isSuperAdmin()) {
            $covered = app(AgentAvailability::class)->coveredBy($user);
            $resolver = app(MembershipCapabilityResolver::class);
            $staffAgencyIds = $resolver->staffAgencyIds($user);
            $memberAgencyIds = $resolver->memberAgencyIds($user);
            $base->where(function ($q) use ($user, $covered, $staffAgencyIds, $memberAgencyIds) {
                // TCK-591 (verif-591 B1, M1) — l'assigné ne voit la tâche que tant qu'il est personnel
                // de l'agence du parent, le créateur tant qu'il en est membre (`TaskPolicy::view`).
                $q->where(fn ($a) => $a->where('assigned_to_id', $user->id)->parentAgencyIn($staffAgencyIds))
                    ->orWhere(fn ($c) => $c->where('created_by_id', $user->id)->parentAgencyIn($memberAgencyIds));
                // TCK-591 (ADR-0035) — pendant une absence, le remplaçant voit les tâches de
                // l'absent rattachées à l'agence de l'absence.
                foreach ($covered as $absence) {
                    $q->orWhere(fn ($c) => $c->where('assigned_to_id', $absence['absent_id'])
                        ->whereHasMorph('taskable', [Customer::class, Property::class], fn ($t) => $t->where('agency_id', $absence['agency_id'])));
                }
            });
        }

        $paginator = Task::buildQuery($base, $request)
            ->defaultSort('-due_at')
            ->paginate();

        WatermarkRequirement::attach($paginator->getCollection()->map(fn (Task $t) => $t->taskable)->filter(fn ($p) => $p instanceof Property));

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Task $t) => $this->format($t, $user))->values());
    }

    /**
     * TCK-2595 — `filter[team]=1` : les tâches de l'équipe, pour qui tient `crm.view_all` dans
     * l'agence de son profil actif, où il est personnel actif (sinon 403). Elle REMPLACE la portée
     * « mes tâches » : les tâches assignées au personnel actif de cette agence (profil agent ou
     * admin actif, ou délégation active — la règle des cibles d'attribution, `filter[assignable]`
     * des membres), dont le parent est dans cette agence. Jamais une autre agence, jamais une tâche
     * personnelle sans parent. `filter[assigned_to_id]` isole un agent.
     *
     * @param  Builder<Task>  $base
     */
    private function teamScope(Builder $base, User $user): void
    {
        $agency = TaskPolicy::teamAgencyOf($user);
        abort_if($agency === null, 403);

        $inAgency = fn (Builder $q) => $q->where('agency_id', $agency->id);
        $actif = fn (Builder $p) => $inAgency($p)->active();

        $base->whereHas('assignee', fn (Builder $u) => $u
            ->whereNotIn('users.status', [UserStatus::Blocked->value, UserStatus::Deleted->value])
            ->where(fn (Builder $w) => $w
                ->whereHas('agentProfiles', $actif)
                ->orWhereHas('agencyAdminProfiles', $actif)
                ->orWhereHas('roleDelegations', fn (Builder $d) => $inAgency($d)
                    ->whereIn('role', [AgencyRoleBaseType::Agent->value, AgencyRoleBaseType::AgencyAdmin->value])
                    ->active())))
            ->parentInAgency((int) $agency->id);
    }

    public function store(StoreTaskRequest $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validatedAvecInstants();

        // Resolve & authorize the polymorphic parent: a user may only attach a
        // task to a record their agency owns / they created (superadmin bypass).
        // Previously the parent was persisted unchecked — a cross-tenant IDOR.
        // TCK-1069 (P62.03) — un parent interdit rend le 404 d'un parent introuvable, comme
        // `DocumentController::store()` (TCK-732) : un 403 dirait qu'une fiche d'une autre agence existe.
        $parent = $data['taskable_type']::query()->find($data['taskable_id']);
        abort_if($parent === null || ! $user->can('attachTo', [Task::class, $parent]), 404);

        // The assignee must be the caller or staff of the parent's agency, so a
        // task can't be pushed into another tenant's task list.
        if (! empty($data['assigned_to_id'])) {
            $this->authorizeAssignee($user, (int) $data['assigned_to_id'], $parent);
            $data['assigned_to_id'] = $this->routeToSubstitute($user, (int) $data['assigned_to_id'], $parent);
        }

        $status = $data['status'] ?? TaskStatus::Open->value;
        $task = Task::create(array_merge($data, [
            'created_by_id' => $user->id,
            'status' => $status,
            'priority' => $data['priority'] ?? TaskPriority::Medium->value,
            // TCK-1311 (P147.09) — une tâche qui naît `done` porte sa date d'achèvement.
            'completed_at' => TaskStatus::from($status) === TaskStatus::Done ? now() : null,
        ]));

        return $this->json(['data' => $this->format($task->load(['assignee', 'creator', 'taskable']), $user)], 201);
    }

    /**
     * TCK-591 — l'assigné est l'appelant, ou du PERSONNEL (agent, admin d'agence) de l'agence du
     * parent de la tâche. Le bailleur en était (`isOwnerAt`) : une tâche de l'agence atterrissait
     * dans la liste d'un propriétaire. Et l'agence jugée est celle du PARENT, plus celle du profil
     * actif de l'appelant : c'est le parent qui dit à quelle équipe la tâche appartient.
     *
     * 422 avec un code, pas 403 : c'est une contrainte sur le corps de la requête.
     */
    protected function authorizeAssignee(User $user, int $assigneeId, ?Model $parent): void
    {
        if ($user->isSuperAdmin()) {
            // TCK-1069 (P62.03) — sans `exists:` au FormRequest, un compte absent finirait en violation
            // de clé étrangère (500).
            abort_code_unless(User::query()->whereKey($assigneeId)->exists(), 422, 'task.assignee_not_staff');

            return;
        }

        // TCK-591 (verif-591 M1) — « soi-même » ne court-circuite le contrôle que sur un parent hors
        // agence ; ailleurs, l'appelant est jugé comme tout assigné. Un retiré se réassignait la
        // tâche que la passation venait de donner à son repreneur.
        $agencyId = $parent?->getAttribute('agency_id');
        if ($assigneeId === $user->id && $agencyId === null) {
            return;
        }

        $assignee = $agencyId !== null ? User::find($assigneeId) : null;
        // TCK-587 — l'assigné est PERSONNEL actif de l'agence du parent, et joignable (TCK-1097) :
        // un compte bloqué ou supprimé ne lira jamais la tâche.
        $ok = PersonnelDeLAgence::estPersonnel($assignee, $agencyId);

        abort_code_unless($ok, 422, 'task.assignee_not_staff');
    }

    /**
     * TCK-591 (ADR-0035) — une tâche confiée à un agent absent part chez son remplaçant, le temps
     * de l'absence. Se l'assigner à soi-même n'est pas routé : qui agit est présent.
     */
    private function routeToSubstitute(User $user, int $assigneeId, ?Model $parent): int
    {
        $agencyId = $parent?->getAttribute('agency_id');
        if ($assigneeId === $user->id || $agencyId === null) {
            return $assigneeId;
        }

        $assignee = User::find($assigneeId);

        return $assignee === null
            ? $assigneeId
            : app(AgentAvailability::class)->substituteFor($assignee, (int) $agencyId)->id;
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        $this->authorize('view', $task);

        return $this->json(['data' => $this->format($task->load(['assignee', 'creator', 'taskable']), $request->user())]);
    }

    public function update(UpdateTaskRequest $request, Task $task): JsonResponse
    {
        $data = $request->validatedAvecInstants();

        // TCK-591 — le contrôle d'assigné de `store` est rejoué dès que l'assigné change : un `PUT`
        // poussait la tâche chez n'importe quel utilisateur de la plateforme.
        if (array_key_exists('assigned_to_id', $data)
            && $data['assigned_to_id'] !== null
            && (int) $data['assigned_to_id'] !== $task->assigned_to_id) {
            $this->authorizeAssignee($request->user(), (int) $data['assigned_to_id'], $task->taskable);
            $data['assigned_to_id'] = $this->routeToSubstitute($request->user(), (int) $data['assigned_to_id'], $task->taskable);
        }

        if (isset($data['status']) && TaskStatus::from($data['status']) === TaskStatus::Done && $task->completed_at === null) {
            $data['completed_at'] = now();
        }
        // TCK-1311 (P147.09) — rouverte, une tâche n'est plus achevée : sa date d'achèvement tombe.
        if (isset($data['status']) && in_array(TaskStatus::from($data['status']), [TaskStatus::Open, TaskStatus::InProgress], true)) {
            $data['completed_at'] = null;
        }

        $task->fill($data)->save();

        return $this->json(['data' => $this->format($task->refresh()->load(['assignee', 'creator', 'taskable']), $request->user())]);
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        // TCK-591 — supprimer est le geste du créateur : l'assigné effaçait sans trace la tâche
        // que son admin lui avait confiée.
        $this->authorize('delete', $task);
        $task->delete();

        return $this->json(null, 204);
    }

    private function format(Task $task, User $viewer): array
    {
        return [
            'id' => $task->id,
            'title' => $task->title,
            'description' => $task->description,
            'taskable_id' => $task->taskable_id,
            'taskable_type' => $task->taskable_type,
            'taskable' => $this->taskable($task, $viewer),
            'status' => $task->status?->value,
            'priority' => $task->priority?->value,
            'due_at' => $this->instant($task->due_at),
            'completed_at' => $this->instant($task->completed_at),
            'assignee' => $this->whenLoaded($task, 'assignee', fn ($u) => ['id' => $u->id, 'name' => $u->getFullNameAttribute()]),
            // TCK-2595 — `include=assignedTo` : clé présente seulement quand elle est demandée.
            ...($task->relationLoaded('assignedTo') ? ['assigned_to' => $this->whenLoaded($task, 'assignedTo', fn ($u) => ['id' => $u->id, 'name' => $u->getFullNameAttribute()])] : []),
            'creator' => $this->whenLoaded($task, 'creator', fn ($u) => ['id' => $u->id, 'name' => $u->getFullNameAttribute()]),
            'created_at' => $this->instant($task->created_at),
        ];
    }

    /**
     * TCK-591 — à quoi la tâche se rattache, en clair : `{type, id, label, phone, subtitle, cover_url}`.
     *
     * TCK-2595 — le libellé (nom du client, titre du bien), le téléphone, la ligne de second rang
     * (`subtitle` : quartier du bien, téléphone du client en E.164 — le front le met en forme) et la
     * vignette du bien se lisent sous la règle de LECTURE du parent (`view` : `CustomerPolicy`,
     * `PropertyPolicy`) — qui peut ouvrir le bien en lit le nom. Ils se lisaient sous `attachTo`,
     * qui exige `update` sur un bien (`properties.update_any` pour le personnel) : l'agent sans cette
     * capacité lisait « Un bien ». `attachTo` reste la règle pour RATTACHER une tâche (`store`).
     *
     * @return array{type: string, id: int, label: ?string, phone: ?string, subtitle: ?string, cover_url: ?string}|null
     */
    private function taskable(Task $task, User $viewer): ?array
    {
        $type = match ($task->taskable_type) {
            Customer::class => 'customer',
            Property::class => 'property',
            default => null,
        };
        if ($type === null || $task->taskable_id === null) {
            return null;
        }

        $parent = $task->taskable;
        $label = null;
        $phone = null;
        $subtitle = null;
        $cover = null;
        if ($parent !== null && $viewer->can('view', $parent)) {
            if ($parent instanceof Customer) {
                $label = $parent->getFullNameAttribute();
                $phone = $parent->phone;
                $normalise = TelephoneSaisi::normaliser($parent->phone);
                $subtitle = is_string($normalise) && $normalise !== '' ? $normalise : null;
            } elseif ($parent instanceof Property) {
                $label = (string) $parent->getAttribute('title');
                $subtitle = $parent->address?->neighborhood;
                $media = $parent->getFirstMedia('photos');
                $cover = $media !== null ? PublicPhotoUrl::upTo($media, 'thumbnail', fn () => $parent->requiresWatermark()) : null;
            }
        }

        return ['type' => $type, 'id' => (int) $task->taskable_id, 'label' => $label, 'phone' => $phone, 'subtitle' => $subtitle, 'cover_url' => $cover];
    }

    private function whenLoaded(Task $task, string $relation, callable $fn): mixed
    {
        return $task->relationLoaded($relation) && $task->$relation !== null
            ? $fn($task->$relation)
            : null;
    }
}
