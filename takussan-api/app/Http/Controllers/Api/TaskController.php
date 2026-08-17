<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreTaskRequest;
use App\Http\Requests\Api\UpdateTaskRequest;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    /**
     * Whitelist of morph classes a task may be attached to. Without this the
     * free-text `taskable_type` accepted any class name (no enforced morph map),
     * letting a user attach tasks to arbitrary records across tenants.
     *
     * @var list<class-string<Model>>
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = Task::query()->with(['assignee', 'creator']);

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('assigned_to_id', $user->id)
                    ->orWhere('created_by_id', $user->id);
            });
        }

        $paginator = Task::buildQuery($base, $request)
            ->defaultSort('-due_at')
            ->paginate();

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Task $t) => $this->format($t))->values());
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

        // The assignee must belong to the caller's agency (or be the caller),
        // so a task can't be pushed into another tenant's task list.
        if (! empty($data['assigned_to_id'])) {
            $this->authorizeAssignee($user, (int) $data['assigned_to_id']);
        }

        $task = Task::create(array_merge($data, [
            'created_by_id' => $user->id,
            'status' => $data['status'] ?? TaskStatus::Open->value,
            'priority' => $data['priority'] ?? TaskPriority::Medium->value,
        ]));

        return $this->json(['data' => $this->format($task->load(['assignee', 'creator']))], 201);
    }

    /**
     * An assignee must be the caller themselves or a member of the caller's
     * agency (agent / agency-admin / owner), preventing cross-tenant assignment.
     */
    protected function authorizeAssignee(User $user, int $assigneeId): void
    {
        if ($assigneeId === $user->id || $user->isSuperAdmin()) {
            return;
        }

        $agencyId = $user->agency_id;
        $assignee = $agencyId ? User::find($assigneeId) : null;
        $ok = $assignee !== null && (
            $assignee->isAgentAt($agencyId)
            || $assignee->isAgencyAdminAt($agencyId)
            || $assignee->isOwnerAt($agencyId)
        );

        abort_unless($ok, 422, 'The assignee must belong to your agency.');
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        $this->authorize('view', $task);

        return $this->json(['data' => $this->format($task->load(['assignee', 'creator']))]);
    }

    public function update(UpdateTaskRequest $request, Task $task): JsonResponse
    {
        $this->authorize('view', $task);

        $data = $request->validated();

        if (isset($data['status']) && TaskStatus::from($data['status']) === TaskStatus::Done && $task->completed_at === null) {
            $data['completed_at'] = now();
        }

        $task->fill($data)->save();

        return $this->json(['data' => $this->format($task->refresh()->load(['assignee', 'creator']))]);
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        $this->authorize('view', $task);
        $task->delete();

        return $this->json(null, 204);
    }

    private function format(Task $task): array
    {
        return [
            'id' => $task->id,
            'title' => $task->title,
            'description' => $task->description,
            'taskable_id' => $task->taskable_id,
            'taskable_type' => $task->taskable_type,
            'status' => $task->status?->value,
            'priority' => $task->priority?->value,
            'due_at' => $task->due_at?->toISOString(),
            'completed_at' => $task->completed_at?->toISOString(),
            'assignee' => $this->whenLoaded($task, 'assignee', fn ($u) => ['id' => $u->id, 'name' => $u->getFullNameAttribute()]),
            'creator' => $this->whenLoaded($task, 'creator', fn ($u) => ['id' => $u->id, 'name' => $u->getFullNameAttribute()]),
            'created_at' => $task->created_at?->toISOString(),
        ];
    }

    private function whenLoaded(Task $task, string $relation, callable $fn): mixed
    {
        return $task->relationLoaded($relation) && $task->$relation !== null
            ? $fn($task->$relation)
            : null;
    }
}
