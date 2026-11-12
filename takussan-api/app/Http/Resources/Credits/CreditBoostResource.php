<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Media\PublicPhotoUrl;
use Illuminate\Http\Request;

/**
 * TCK-2663 — une mise en avant de l'espace et ce qu'elle a rapporté : `measures`, posé sur le boost
 * par `App\Services\Credits\BoostMeasures::attachTo()` (comme un `withCount`), `null` s'il ne l'a
 * pas été — jamais des zéros inventés.
 *
 * @mixin PropertyBoost
 */
class CreditBoostResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->enumValue($this->kind),
            'variant' => $this->enumValue($this->variant),
            'status' => $this->enumValue($this->status),
            'price_credits' => $this->price_credits,
            // TCK-2664 — la durée achetée (cumulée par une prolongation ; 0 pour une Remontée) : « Vedette 7 j »
            // et « Relancer », qui rachète l'offre active de même famille et de même durée.
            'duration_days' => $this->duration_days,
            'starts_at' => $this->iso($this->starts_at),
            'ends_at' => $this->iso($this->ends_at),
            'ended_at' => $this->iso($this->ended_at),
            'property' => self::propertyCard($this->property),
            'measures' => $this->resource->getAttribute('measures'),
        ];
    }

    /**
     * Le bien tel que la page Crédits le montre : sa photo par le seul chemin des URL publiques
     * (jamais l'original, filigrane respecté) et son quartier. Relations `media`, `address` et
     * `agency` préchargées par l'appelant.
     *
     * @return array{id: int, title: ?string, main_photo_url: ?string, quarter: ?string}|null
     */
    public static function propertyCard(?Property $property): ?array
    {
        if ($property === null) {
            return null;
        }

        $media = $property->getFirstMedia('photos');

        return [
            'id' => $property->id,
            'title' => $property->title,
            'main_photo_url' => $media !== null
                ? PublicPhotoUrl::upTo($media, 'preview', fn () => $property->requiresWatermark())
                : null,
            'quarter' => $property->address?->neighborhood,
        ];
    }
}
