<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\TagMergeRequest;
use App\Http\Requests\Admin\TagRenameRequest;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Services\Tags\TagModeration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** TCK-633 (ADR-0062 §7) — la file des équipements proposés, sous `super-admin`. */
class TagModerationAdminController extends Controller
{
    public function __construct(private readonly TagModeration $moderation) {}

    public function proposals(Request $request): JsonResponse
    {
        $base = Tag::query()
            ->where('type', TagType::Amenity->value)
            ->with('createdBy')
            ->withCount('properties');

        $paginator = Tag::buildQuery($base, $request)->defaultSort('-created_at')->paginate();

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Tag $t) => $this->format($t))->values());
    }

    public function approve(Request $request, Tag $tag): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->approuver($tag, $request->user()))]);
    }

    public function reject(Request $request, Tag $tag): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->rejeter($tag, $request->user()))]);
    }

    public function rename(TagRenameRequest $request, Tag $tag): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->renommer($tag, (string) $request->validated('name'), $request->user()))]);
    }

    public function merge(TagMergeRequest $request, Tag $tag): JsonResponse
    {
        $cible = Tag::query()->findOrFail((int) $request->validated('into_id'));

        return $this->json(['data' => $this->format($this->moderation->fusionner($tag, $cible, $request->user()))]);
    }

    /** @return array<string, mixed> */
    private function format(Tag $t): array
    {
        $t->loadMissing('createdBy');

        return [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'type' => $t->type?->value,
            'status' => $t->status?->value,
            'created_by' => $t->createdBy !== null ? ['id' => $t->createdBy->id, 'name' => trim($t->createdBy->first_name.' '.$t->createdBy->last_name)] : null,
            'properties_count' => (int) ($t->properties_count ?? $t->properties()->count()),
            'created_at' => $t->created_at?->toIso8601String(),
        ];
    }
}
