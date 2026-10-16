<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreTagRequest;
use App\Http\Requests\Api\UpdateTagRequest;
use App\Models\Enums\ReferentialStatus;
use App\Models\Tag;
use App\Services\Geo\GeoReindexation;
use App\Services\Tags\TagModeration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TagController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // TCK-666 (P03.03) — une étiquette CRM ne sort que vers le personnel d'une agence dont un
        // client la porte. Le périmètre ne dépend plus de `filter[type]=crm`, ni de `agency_id`.
        $base = Tag::query()->sansCrmHorsDeSonAgence($request->user());

        // TCK-633 — hors console : les approuvés, plus les propositions de l'appelant.
        $appelant = $request->user();
        if (! $appelant?->isSuperAdmin()) {
            $base->where(fn ($q) => $q
                ->where('tags.status', ReferentialStatus::Approved->value)
                ->orWhere(fn ($q) => $q->where('tags.status', ReferentialStatus::Pending->value)->where('tags.created_by_id', $appelant?->id)));
        }

        $agencyId = $appelant?->agency_id;

        // TCK-712 (P02.05) — les comptes se posent APRÈS `buildQuery()` : un `fields[tags]=…`
        // y remplace la liste des colonnes, et un `withCount` posé avant disparaissait avec elle.
        // `format()` recomptait alors les biens étiquette par étiquette.
        $paginator = Tag::buildQuery($base, $request, $agencyId)
            ->withCount(['properties', 'customers'])
            ->defaultSort('name')
            ->paginate();

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Tag $t) => $this->format($t, $agencyId))->values());
    }

    public function store(StoreTagRequest $request): JsonResponse
    {

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
        // TCK-633 (D9) — la visibilité de la liste : une proposition d'un autre, ou un refus, est
        // introuvable hors console. Sans elle, les identifiants séquentiels livraient le nom d'une
        // proposition en attente, que `tag_names` rattachait ensuite à un autre bien.
        $appelant = $request->user();
        abort_unless(
            $appelant?->isSuperAdmin()
                || $tag->status === ReferentialStatus::Approved
                || ($tag->status === ReferentialStatus::Pending && $appelant !== null && $tag->created_by_id === $appelant->id),
            404,
        );
        // TCK-666 (P03.03) — même périmètre CRM que la liste, et même 404.
        abort_unless(Tag::query()->whereKey($tag->getKey())->sansCrmHorsDeSonAgence($appelant)->exists(), 404);

        return $this->json(['data' => $this->format($tag)]);
    }

    public function update(UpdateTagRequest $request, Tag $tag, TagModeration $moderation, GeoReindexation $reindexation): JsonResponse
    {
        $data = $request->validated();

        // TCK-633 (ADR-0062 §7) — la page catalogue renomme par ici : même chemin que la file de
        // modération, qui refuse en 409 un nom déjà pris (casse repliée) et RÉINDEXE les biens.
        if (array_key_exists('name', $data) && $data['name'] !== $tag->name) {
            $moderation->renommer($tag, (string) $data['name'], $request->user());
        }
        unset($data['name']);

        $tag->refresh()->fill($data);
        $visibiliteChangee = $tag->isDirty(['type', 'status']);
        $tag->save();
        if ($visibiliteChangee) {
            $reindexation->biens($tag->properties()->pluck('properties.id')->map(fn ($id) => (int) $id)->all());
        }

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
                + (int) ($tag->properties_count ?? $tag->properties()->count());
        }

        return [
            'id' => $tag->id,
            'name' => $tag->name,
            'slug' => $tag->slug,
            'type' => $tag->type?->value,
            'status' => $tag->status?->value,
            'created_by_id' => $tag->created_by_id,
            'icon' => $tag->icon,
            'color' => $tag->color,
            'description' => $tag->description,
            'properties_count' => (int) ($tag->properties_count ?? $tag->properties()->count()),
            'usage_count' => $usageCount,
            'created_at' => $tag->created_at?->toISOString(),
        ];
    }
}
