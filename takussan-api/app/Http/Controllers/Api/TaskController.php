<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Customer;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    /**
     * Whitelist of morph classes a task may be attached to. Without this the
     * free-text `taskable_type` accepted any class name (no enforced morph map),
     * letting a user attach tasks to arbitrary records across tenants.
     *
     * @var list<class-string<Model>>
     */
    private const TASKABLE_TYPES = [
        Property::class,
        Customer::class,
    ];

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

        return $this->json([
            'data' => $paginator->getCollection()->map(fn (Task $t) => $this->format($t))->values(),
            'meta' => ['total' => $paginator->total(), 'current_page' => $paginator->currentPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'taskable_id' => ['required', 'integer'],
            'taskable_type' => ['required', 'string', Rule::in(self::TASKABLE_TYPES)],
            'assigned_to_id' => ['nullable', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
            'status' => ['nullable', Rule::enum(TaskStatus::class)],
            'priority' => ['nullable', Rule::enum(TaskPriority::class)],
        ]);

        // Resolve & authorize the polymorphic parent: a user may only attach a
        // task to a record their agency owns / they created (superadmin bypass).
        // Previously the parent was persisted unchecked — a cross-tenant IDOR.
        $parent = $data['taskable_type']::query()->findOrFail($data['taskable_id']);
        $this->authorizeTaskable($user, $parent);

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
     * Mirror the per-resource access rule (agency match / ownership / superadmin)
     * for the record a task is being attached to.
     */
    protected function authorizeTaskable(User $user, Model $parent): void
    {
        if ($user->isSuperAdmin()) {
            return;
        }

        // Ownership columns differ by model: Property owns via `user_id`,
        // Customer via `added_by_id`. We check both (a missing column resolves to
        // null and is simply skipped) plus the agency match, mirroring the
        // per-resource access rules in Property/CustomerController.
        $agencyId = $user->agency_id;
        $ok = ($agencyId && (int) ($parent->getAttribute('agency_id') ?? 0) === (int) $agencyId)
            || $parent->getAttribute('added_by_id') === $user->id
            || $parent->getAttribute('user_id') === $user->id;

        abort_unless($ok, 403);
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
        $this->authorizeAccess($request, $task);

        return $this->json(['data' => $this->format($task->load(['assignee', 'creator']))]);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $this->authorizeAccess($request, $task);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'assigned_to_id' => ['sometimes', 'nullable', 'exists:users,id'],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::enum(TaskStatus::class)],
            'priority' => ['sometimes', Rule::enum(TaskPriority::class)],
        ]);

        if (isset($data['status']) && TaskStatus::from($data['status']) === TaskStatus::Done && $task->completed_at === null) {
            $data['completed_at'] = now();
        }

        $task->fill($data)->save();

        return $this->json(['data' => $this->format($task->refresh()->load(['assignee', 'creator']))]);
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        $this->authorizeAccess($request, $task);
        $task->delete();

        return $this->json(null, 204);
    }

    protected function authorizeAccess(Request $request, Task $task): void
    {
        $user = $request->user();
        $ok = $user->isSuperAdmin()
            || $task->created_by_id === $user->id
            || $task->assigned_to_id === $user->id;

        abort_unless($ok, 403);
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
