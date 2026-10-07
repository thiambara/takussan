<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreTaskRequest;
use App\Http\Requests\Api\UpdateTaskRequest;
use App\Models\Customer;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Services\Agency\AgentAvailability;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = Task::query()->with(['assignee', 'creator', 'taskable']);

        if (! $user->isSuperAdmin()) {
            $covered = app(AgentAvailability::class)->coveredBy($user);
            $base->where(function ($q) use ($user, $covered) {
                $q->where('assigned_to_id', $user->id)
                    ->orWhere('created_by_id', $user->id);
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

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Task $t) => $this->format($t, $user))->values());
    }

    public function store(StoreTaskRequest $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validated();

        // Resolve & authorize the polymorphic parent: a user may only attach a
        // task to a record their agency owns / they created (superadmin bypass).
        // Previously the parent was persisted unchecked — a cross-tenant IDOR.
        $parent = $data['taskable_type']::query()->findOrFail($data['taskable_id']);
        $this->authorize('attachTo', [Task::class, $parent]);

        // The assignee must be the caller or staff of the parent's agency, so a
        // task can't be pushed into another tenant's task list.
        if (! empty($data['assigned_to_id'])) {
            $this->authorizeAssignee($user, (int) $data['assigned_to_id'], $parent);
            $data['assigned_to_id'] = $this->routeToSubstitute($user, (int) $data['assigned_to_id'], $parent);
        }

        $task = Task::create(array_merge($data, [
            'created_by_id' => $user->id,
            'status' => $data['status'] ?? TaskStatus::Open->value,
            'priority' => $data['priority'] ?? TaskPriority::Medium->value,
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
        if ($assigneeId === $user->id || $user->isSuperAdmin()) {
            return;
        }

        $agencyId = $parent?->getAttribute('agency_id');
        $assignee = $agencyId !== null ? User::find($assigneeId) : null;
        // TCK-587 — prédicat « personnel de l'agence » ; remplacé par `isStaffAt()` à sa fusion.
        $ok = $assignee !== null && (
            $assignee->isAgentAt((int) $agencyId)
            || $assignee->isAgencyAdminAt((int) $agencyId)
        );

        if (! $ok) {
            throw new HttpResponseException($this->json([
                'code' => 'task_assignee_not_staff',
                'message' => __('crm.tasks.assignee_not_staff'),
            ], 422));
        }
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
        $data = $request->validated();

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
            'due_at' => $task->due_at?->toISOString(),
            'completed_at' => $task->completed_at?->toISOString(),
            'assignee' => $this->whenLoaded($task, 'assignee', fn ($u) => ['id' => $u->id, 'name' => $u->getFullNameAttribute()]),
            'creator' => $this->whenLoaded($task, 'creator', fn ($u) => ['id' => $u->id, 'name' => $u->getFullNameAttribute()]),
            'created_at' => $task->created_at?->toISOString(),
        ];
    }

    /**
     * TCK-591 — à quoi la tâche se rattache, en clair : `{type, id, label}`.
     *
     * Le libellé (nom du client, titre du bien) n'est rendu qu'à qui passe le contrôle de
     * rattachement (`TaskPolicy::attachTo`) : l'assigné d'une tâche ne lit pas, par elle, le nom
     * d'un client qu'il ne verrait pas autrement.
     *
     * @return array{type: string, id: int, label: ?string}|null
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
        if ($parent !== null && $viewer->can('attachTo', [Task::class, $parent])) {
            $label = $parent instanceof Customer
                ? $parent->getFullNameAttribute()
                : (string) $parent->getAttribute('title');
        }

        return ['type' => $type, 'id' => (int) $task->taskable_id, 'label' => $label];
    }

    private function whenLoaded(Task $task, string $relation, callable $fn): mixed
    {
        return $task->relationLoaded($relation) && $task->$relation !== null
            ? $fn($task->$relation)
            : null;
    }
}
