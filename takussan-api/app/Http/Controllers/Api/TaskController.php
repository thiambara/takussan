<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = Task::query()->with(['assignee', 'creator']);

        if (! $user->hasRole('super_admin')) {
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
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'taskable_id' => ['required', 'integer'],
            'taskable_type' => ['required', 'string'],
            'assigned_to_id' => ['nullable', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
            'status' => ['nullable', Rule::enum(TaskStatus::class)],
            'priority' => ['nullable', Rule::enum(TaskPriority::class)],
        ]);

        $task = Task::create(array_merge($data, [
            'created_by_id' => $request->user()->id,
            'status' => $data['status'] ?? TaskStatus::Open->value,
            'priority' => $data['priority'] ?? TaskPriority::Medium->value,
        ]));

        return $this->json(['data' => $this->format($task->load(['assignee', 'creator']))], 201);
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
        $ok = $user->hasRole('super_admin')
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
