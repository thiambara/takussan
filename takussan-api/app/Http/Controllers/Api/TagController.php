<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreTagRequest;
use App\Http\Requests\Api\UpdateTagRequest;
use App\Models\Enums\TagType;
use App\Models\Tag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TagController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $base = Tag::query()->withCount(['properties', 'customers']);

        // For CRM tags, scope to tags used by the requesting user's agency customers.
        // This lets autocomplete show only tags relevant to the agent's agency.
        if ($request->input('filter.type') === TagType::Crm->value) {
            $user = $request->user();
            if ($user && ! $user->isSuperAdmin() && $user->agency_id) {
                $agencyId = $user->agency_id;
                $base->whereHas('customers', fn ($q) => $q->where('agency_id', $agencyId));
            }
        }

        $paginator = Tag::buildQuery($base, $request)
            ->defaultSort('name')
            ->paginate();

        $user = $request->user();
        $agencyId = $user?->agency_id;

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Tag $t) => $this->format($t, $agencyId))->values());
    }

    public function store(StoreTagRequest $request): JsonResponse
    {
        $this->authorizeWrite($request);

        $data = $request->validated();

        $tag = Tag::create($data);

        activity('Admin')
            ->performedOn($tag)
            ->causedBy($request->user())
            ->withProperties(['tag_id' => $tag->id, 'name' => $tag->name, 'type' => $tag->type?->value])
            ->event('super_admin_tag_created')
            ->log('Tag plateforme créé');

        return $this->json(['data' => $this->format($tag)], 201);
    }

    public function show(Request $request, Tag $tag): JsonResponse
    {
        return $this->json(['data' => $this->format($tag)]);
    }

    public function update(UpdateTagRequest $request, Tag $tag): JsonResponse
    {
        $this->authorizeWrite($request);

        $data = $request->validated();

        $tag->fill($data)->save();

        activity('Admin')
            ->performedOn($tag)
            ->causedBy($request->user())
            ->withProperties(['tag_id' => $tag->id, 'changed' => array_keys($data)])
            ->event('super_admin_tag_updated')
            ->log('Tag plateforme modifié');

        return $this->json(['data' => $this->format($tag->refresh())]);
    }

    public function destroy(Request $request, Tag $tag): JsonResponse
    {
        $this->authorizeWrite($request);

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

        activity('Admin')
            ->performedOn($tag)
            ->causedBy($request->user())
            ->withProperties(['tag_id' => $tag->id, 'name' => $tag->name])
            ->event('super_admin_tag_disabled')
            ->log('Tag plateforme désactivé');

        $tag->delete();

        return $this->json(null, 204);
    }

    private function authorizeWrite(Request $request): void
    {
        abort_unless($request->user()?->isSuperAdmin(), 403);
    }

    private function format(Tag $tag, ?int $agencyId = null): array
    {
        $usageCount = null;
        if ($agencyId !== null) {
            $usageCount = $tag->customers()->where('agency_id', $agencyId)->count()
                + $tag->properties()->count();
        }

        return [
            'id' => $tag->id,
            'name' => $tag->name,
            'slug' => $tag->slug,
            'type' => $tag->type?->value,
            'icon' => $tag->icon,
            'color' => $tag->color,
            'description' => $tag->description,
            'properties_count' => (int) ($tag->properties_count ?? $tag->properties()->count()),
            'usage_count' => $usageCount,
            'created_at' => $tag->created_at?->toISOString(),
        ];
    }
}
