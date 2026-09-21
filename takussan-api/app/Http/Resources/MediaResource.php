<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Property;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Media\WatermarkRequirement;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Pagination\AbstractPaginator;
use Illuminate\Support\Facades\Gate;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * @mixin Media
 */
class MediaResource extends BaseResource
{
    /**
     * La décision `viewRaw` prise par `collection()` pour CETTE ressource. Portée par l'instance
     * de ressource, jamais par une structure statique ni par le média : une décision n'existe que
     * dans la collection rendue pour l'utilisateur qui l'a prise. Un `new MediaResource($media)`
     * — autre utilisateur, même instance de média — n'hérite de rien (F2, passe adverse 3 : une
     * `WeakMap` statique indexée par le média transmettait l'original signé du super-admin à un
     * tiers).
     *
     * ⚠ Résidu voulu (passe adverse 4) : la décision est prise À LA CONSTRUCTION de la collection,
     * pour l'utilisateur courant. Résoudre la même collection — ou un élément extrait de
     * `$col->collection` — sous un autre utilisateur rend la décision du premier. Aucun chemin ne
     * réutilise une ressource entre requêtes aujourd'hui (pas de cache de ressources, FrankenPHP
     * en mode classique) ; ce serait le cas sous Octane ou avec un cache de ressources. Règle :
     * **ne jamais mettre une `MediaResource` en cache ni la réutiliser hors de la requête qui l'a
     * construite.**
     */
    private ?bool $viewRaw = null;

    /**
     * TCK-545 (N+1) — une liste de médias à disques séparés décide du filigrane en UNE requête au
     * plus, comme `PropertyResource::collection()` (`WatermarkRequirement`, tck539b). Le bien
     * propriétaire est chargé d'un coup : `viewRaw` et la règle de filigrane le lisent tous deux.
     *
     * `viewRaw` ne dépend que de l'utilisateur et du PROPRIÉTAIRE du média (`MediaPolicy`), jamais
     * du média : la décision se prend une fois par propriétaire distinct (`model_type` +
     * `model_id`) — évaluée par média, elle coûtait ~6 requêtes de profils chacune. Un média
     * rendu seul (`new MediaResource`) la prend lui-même, inchangé.
     *
     * @return AnonymousResourceCollection
     */
    public static function collection($resource)
    {
        $items = $resource instanceof AbstractPaginator ? $resource->getCollection() : collect($resource);
        $split = new EloquentCollection(
            $items->filter(fn (mixed $m) => $m instanceof Media && self::hasPublicConversionsOnly($m))->values()->all(),
        );

        /** @var array<string, bool> $decisions propriétaire (`model_type:model_id`) → viewRaw */
        $decisions = [];

        if ($split->isNotEmpty()) {
            $split->loadMissing('model');
            WatermarkRequirement::attach($split->pluck('model')->filter(fn (mixed $m) => $m instanceof Property));

            foreach ($split->groupBy(fn (Media $m) => self::ownerKey($m)) as $owner => $owned) {
                $decisions[$owner] = Gate::allows('viewRaw', $owned->first());
            }
        }

        $collection = parent::collection($resource);

        foreach ($collection->collection as $item) {
            if ($item instanceof self && $item->resource instanceof Media) {
                $item->viewRaw = $decisions[self::ownerKey($item->resource)] ?? null;
            }
        }

        return $collection;
    }

    private static function ownerKey(Media $media): string
    {
        return $media->model_type.':'.$media->model_id;
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Media $media */
        $media = $this->resource;

        if ($this->hasPublicConversionsOnly($media)) {
            return $this->splitDisks($media);
        }

        return [
            'id' => $media->id,
            'collection_name' => $media->collection_name,
            'file_name' => $media->file_name,
            'mime_type' => $media->mime_type,
            'size' => (int) $media->size,
            // TCK-545 — un média du disque PRIVÉ ne sort que par une URL d'API signée
            // (`media.private.show`, TCK-539) : `getUrl()` n'y est servie par personne. La
            // décision se prend sur le DISQUE, pas sur le nom de la collection.
            'url' => $this->isPrivate($media)
                ? app(PrivateMediaAccess::class)->signedUrl($media)
                : $media->getUrl(),
            'conversions' => [
                'thumbnail' => $this->conversionUrl($media, 'thumbnail'),
                'preview' => $this->conversionUrl($media, 'preview'),
                'full' => $this->conversionUrl($media, 'full'),
            ],
            'model_type' => $media->model_type,
            'model_id' => $media->model_id,
            'created_at' => $this->iso($media->created_at),
        ];
    }

    protected function conversionUrl(Media $media, string $name): ?string
    {
        // TCK-545 — la route signée ne sert que l'original : une conversion privée n'a pas
        // d'URL à exposer. Les collections privées actuelles n'en déclarent d'ailleurs aucune,
        // sauf `User.photos` / `User.documents` (HasMediaConversions), qu'aucun écran n'affiche.
        if ($this->isPrivate($media) || ! $media->hasGeneratedConversion($name)) {
            return null;
        }

        if (request()->boolean('raw') && Gate::allows('viewRaw', $media)) {
            return $media->getUrl();
        }

        $url = $media->getUrl($name);

        return $url !== '' ? $url : null;
    }

    protected static function isPrivate(Media $media): bool
    {
        return $media->disk !== config('media-library.public_disk_name');
    }

    /**
     * TCK-545, mission 5 — original PRIVÉ, conversions PUBLIQUES : aujourd'hui `Property.photos`
     * (TCK-539, D2). Juger sur le seul `disk` la traitait en collection privée : conversions à
     * `null`, affichage dégradé.
     */
    protected static function hasPublicConversionsOnly(Media $media): bool
    {
        return self::isPrivate($media)
            && $media->conversions_disk === config('media-library.public_disk_name');
    }

    /**
     * Même règle que la console des photos (`PropertyMediaController::urls`) : les conversions
     * sortent par `PublicPhotoUrl` — servables seulement, filigrane compris — et l'original,
     * non filigrané, par une URL signée réservée à `viewRaw`. Sans `viewRaw`, `url` est la plus
     * grande conversion servable, jamais l'original (TCK-106).
     *
     * @return array<string,mixed>
     */
    protected function splitDisks(Media $media): array
    {
        $raw = $this->viewRaw ?? Gate::allows('viewRaw', $media);
        // Paresseux : la règle lit l'agence du bien, inutile quand la trace suffit.
        $required = static fn (): bool => ! $raw
            && $media->model instanceof Property
            && $media->model->requiresWatermark();

        return [
            'id' => $media->id,
            'collection_name' => $media->collection_name,
            'file_name' => $media->file_name,
            'mime_type' => $media->mime_type,
            'size' => (int) $media->size,
            'url' => $raw
                ? app(PrivateMediaAccess::class)->signedUrl($media)
                : PublicPhotoUrl::upTo($media, 'full', $required),
            'conversions' => [
                'thumbnail' => PublicPhotoUrl::upTo($media, 'thumbnail', $required),
                'preview' => PublicPhotoUrl::upTo($media, 'preview', $required),
                'full' => PublicPhotoUrl::upTo($media, 'full', $required),
            ],
            'model_type' => $media->model_type,
            'model_id' => $media->model_id,
            'created_at' => $this->iso($media->created_at),
        ];
    }
}
