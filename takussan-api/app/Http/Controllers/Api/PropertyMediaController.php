<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ReorderPropertyMediaRequest;
use App\Http\Requests\Api\StorePropertyMediaRequest;
use App\Models\Property;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Media\PublicPhotoUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyMediaController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorize('viewMedia', $property);

        $watermarkRequired = $property->requiresWatermark();
        $photos = $property->getMedia('photos')->each(fn (Media $m) => $m->setRelation('model', $property));
        $raw = $this->viewRaw($photos->first());

        $media = $photos->map(fn (Media $m) => $this->urls($m, $watermarkRequired, $raw) + [
            'order' => $m->order_column,
        ]);

        return $this->json(['data' => $media->values()]);
    }

    public function store(StorePropertyMediaRequest $request, Property $property): JsonResponse
    {

        $added = [];
        $raw = null;
        foreach ($request->file('photos', []) as $photo) {
            $media = null;
            try {
                $media = $property->addMedia($photo)->toMediaCollection('photos');
            } catch (\Throwable $e) {
                $media?->delete();

                throw ValidationException::withMessages([
                    'photos' => ['Cette image ne peut pas être traitée. Vérifiez le fichier puis réessayez.'],
                ]);
            }

            // `refresh()` : l'instance rendue par `addMedia()` ne voit pas ce que les
            // conversions ont écrit sur leur copie du média (TCK-539).
            $media->refresh()->setRelation('model', $property);
            $raw ??= $this->viewRaw($media);
            $added[] = $this->urls($media, $property->requiresWatermark(), $raw);
        }

        return $this->json(['data' => $added], 201);
    }

    /**
     * TCK-356 — même clé `full` que `PropertyResource`, et même repli ; TCK-539 — ce repli
     * vaut pour les trois conversions (`PublicPhotoUrl`) : `preview` et `full` sont en file,
     * et `getUrl()` construisait une URL en 404 jusqu'au passage de `worker-media`.
     *
     * ⚠ **Cette route n'est PAS réservée au propriétaire** : `PropertyPolicy::viewMedia` l'ouvre
     * à tout utilisateur authentifié dès que le bien est public et publié. Elle rendait pourtant
     * `original` = `getUrl()`, le fichier source non filigrané, à n'importe quel compte — le
     * contournement même que TCK-106 ferme sur la fiche. La règle est donc celle de
     * `PropertyResource`, décidée par `viewRaw` (TCK-539, D2 et D3) :
     *
     * - `viewRaw` : l'original, par l'URL d'API signée (il vit sur le disque PRIVÉ), et les
     *   conversions même pas encore filigranées — ce détenteur voit déjà la source ;
     * - sinon : pas d'original (`original` = la plus grande conversion servable, comme sur la
     *   fiche), et seules les conversions filigranées quand le bien l'exige.
     *
     * Conséquence assumée : juste après l'upload, un agent SANS `viewRaw` voit une case vide
     * jusqu'au passage de `worker-media` (la miniature est produite, pas encore filigranée).
     *
     * @return array{id: int, thumbnail: ?string, preview: ?string, full: ?string, original: ?string}
     */
    private function urls(Media $media, bool $watermarkRequired, bool $raw): array
    {
        $required = $watermarkRequired && ! $raw;

        return [
            'id' => $media->id,
            'thumbnail' => PublicPhotoUrl::upTo($media, 'thumbnail', $required),
            'preview' => PublicPhotoUrl::upTo($media, 'preview', $required),
            'full' => PublicPhotoUrl::upTo($media, 'full', $required),
            'original' => $raw
                ? app(PrivateMediaAccess::class)->signedUrl($media)
                : PublicPhotoUrl::upTo($media, 'full', $required),
        ];
    }

    /**
     * `viewRaw` ne dépend que de l'utilisateur et du PROPRIÉTAIRE du média (`MediaPolicy`), jamais
     * du média lui-même : tous les médias de cette route sont ceux d'un même bien, la décision se
     * prend UNE fois par requête. Évaluée par média, elle coûtait ~6 requêtes de profils chacune.
     */
    private function viewRaw(?Media $media): bool
    {
        return $media !== null && Gate::allows('viewRaw', $media);
    }

    public function destroy(Request $request, Property $property, int $mediaId): JsonResponse
    {
        $this->authorize('update', $property);
        $property->getMedia('photos')->firstWhere('id', $mediaId)?->delete();

        return $this->json(['message' => 'deleted'], 204);
    }

    public function reorder(ReorderPropertyMediaRequest $request, Property $property): JsonResponse
    {

        $data = $request->validated();

        $mediaCollection = $property->getMedia('photos');
        foreach ($data['order'] as $position => $mediaId) {
            $mediaCollection->firstWhere('id', $mediaId)?->update(['order_column' => $position + 1]);
        }

        return $this->json(['message' => 'reordered']);
    }
}
