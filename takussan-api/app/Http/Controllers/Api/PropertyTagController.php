<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\SyncPropertyTagRequest;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
    public function sync(SyncPropertyTagRequest $request, Property $property): JsonResponse
    {
        $data = $request->validated();

        $horsPerimetre = $property->tags()
            ->where('tags.type', '!=', TagType::Amenity->value)
            ->pluck('tags.id')
            ->all();

        $property->tags()->sync([...$horsPerimetre, ...$data['tag_ids']]);

        return $this->json(['data' => $property->tags()->get()]);
    }

    public function destroy(Request $request, Property $property, Tag $tag): JsonResponse
    {
        $this->authorize('update', $property);

        $property->tags()->detach($tag->id);

        return $this->json(null, 204);
    }
}
