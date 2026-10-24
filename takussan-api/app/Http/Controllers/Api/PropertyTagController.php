<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\SyncPropertyTagRequest;
use App\Http\Resources\PropertyTagResource;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Services\Tags\TagProposals;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PropertyTagController extends Controller
{
    /**
     * TCK-488 — la synchronisation porte sur les ÉQUIPEMENTS, pas sur tous les tags du bien.
     *
     * `sync()` nu remplaçait la totalité de la table de liaison. Or `SyncPropertyTagRequest`
     * n'accepte que des ids de type `amenity` : un tag d'un autre type ne pouvait ni être renvoyé
     * par l'appelant (422) ni survivre à l'appel (détaché). L'écran d'édition n'affiche que les
     * équipements — *il ne peut pas répondre de ce qu'il ne montre pas*, et le seeder de couverture
     * attache couramment des tags `feature` aux biens.
     *
     * Le périmètre de l'écriture est donc celui de la validation : ce qui est hors de sa portée
     * est reconduit tel quel.
     */
    public function sync(SyncPropertyTagRequest $request, Property $property, TagProposals $propositions): JsonResponse
    {
        $data = $request->validated();

        $horsPerimetre = $property->tags()
            ->where('tags.type', '!=', TagType::Amenity->value)
            ->pluck('tags.id')
            ->all();

        // TCK-633 (ADR-0062 §5, D9) — les équipements tapés deviennent des propositions.
        $proposes = $propositions->resoudre($data['tag_names'] ?? [], $request->user());

        $changements = $property->tags()->sync(array_values(array_unique([...$horsPerimetre, ...$data['tag_ids'], ...$proposes])));

        // TCK-633 (D9) — qui rattache : une proposition en attente ne sort sur une fiche publique
        // que là où son AUTEUR l'a rattachée (`Tag::scopeVisiblesSurUneFiche`). Seules les liaisons
        // NOUVELLES sont marquées : un aller-retour du formulaire ne réattribue rien.
        if ($changements['attached'] !== []) {
            DB::table('taggables')
                ->where('taggable_type', $property->getMorphClass())
                ->where('taggable_id', $property->getKey())
                ->whereIn('tag_id', $changements['attached'])
                ->update(['attached_by_id' => $request->user()->getKey()]);
        }

        // TCK-633 (lot E) — le filtre Équipements lit l'index, et cette route ne touche pas la ligne
        // `properties` : sans réindexation, le bien restait introuvable par ses équipements.
        // TCK-1099 (P90.01) — `reindexer()`, pas `searchable()` : un brouillon ou un bien d'agence
        // non active n'a rien à faire dans l'index.
        if (array_filter($changements) !== []) {
            $property->reindexer();
        }

        // TCK-2045 (P61.04) — par la ressource : le modèle brut rendait son `pivot`, nom de classe compris.
        return $this->json(['data' => PropertyTagResource::collection($property->tags()->get())->resolve($request)]);
    }

    public function destroy(Request $request, Property $property, Tag $tag): JsonResponse
    {
        $this->authorize('update', $property);

        if ($property->tags()->detach($tag->id) > 0) {
            $property->reindexer();
        }

        return $this->json(null, 204);
    }
}
