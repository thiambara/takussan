<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\TagType;
use App\Models\Tag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TagController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $paginator = Tag::buildQuery(null, $request)
            ->defaultSort('name')
            ->paginate();

        return $this->json([
            'data' => $paginator->getCollection()->map(fn (Tag $t) => $this->format($t))->values(),
            'meta' => ['total' => $paginator->total(), 'current_page' => $paginator->currentPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', Rule::enum(TagType::class)],
            'icon' => ['nullable', 'string'],
            'color' => ['nullable', 'string', 'max:20'],
            'description' => ['nullable', 'string'],
        ]);

        $tag = Tag::create($data);

        return $this->json(['data' => $this->format($tag)], 201);
    }

    public function show(Request $request, Tag $tag): JsonResponse
    {
        return $this->json(['data' => $this->format($tag)]);
    }

    public function update(Request $request, Tag $tag): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'type' => ['sometimes', Rule::enum(TagType::class)],
            'icon' => ['sometimes', 'nullable', 'string'],
            'color' => ['sometimes', 'nullable', 'string', 'max:20'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $tag->fill($data)->save();

        return $this->json(['data' => $this->format($tag->refresh())]);
    }

    public function destroy(Request $request, Tag $tag): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        // TCK-066: protect deletion when the tag is still attached to any
        // taggable model (currently properties or customers). The admin UI
        // surfaces the 409 and offers a fallback action (rename / detach).
        $usage = $tag->properties()->count() + $tag->customers()->count();
        if ($usage > 0) {
            return $this->json([
                'message' => __('messages.tag_in_use'),
                'usage' => $usage,
            ], 409);
        }

        $tag->delete();

        return $this->json(null, 204);
    }

    private function format(Tag $tag): array
    {
        return [
            'id' => $tag->id,
            'name' => $tag->name,
            'slug' => $tag->slug,
            'type' => $tag->type?->value,
            'icon' => $tag->icon,
            'color' => $tag->color,
            'description' => $tag->description,
            'created_at' => $tag->created_at?->toISOString(),
        ];
    }
}
