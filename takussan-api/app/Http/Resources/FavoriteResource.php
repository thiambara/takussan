<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Favorite;
use Illuminate\Http\Request;

/**
 * TCK-599 §1 — `availability` dit POURQUOI un favori n'est plus décrit, et `property` ne porte la
 * carte complète que pour un bien `available` : `{id, slug, title}` sinon, `null` s'il est supprimé.
 *
 * `available` se lit sur `property_is_public`, calculé par `scopePublic()` (cf.
 * `FavoriteController::projected()`), jamais recalculé ici : {@see Favorite::availabilityOf()}.
 * ⚠ `alert_baseline_price` n'est jamais émis : un prix de référence décrit le bien.
 */
class FavoriteResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $availability = Favorite::availabilityOf(
            $this->relationLoaded('property') ? $this->property : null,
            (bool) $this->property_is_public,
        );

        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'user_id' => $this->user_id,
            'notes' => $this->notes,
            'availability' => $availability,
            'property' => $this->whenLoaded('property', fn () => match ($availability) {
                Favorite::AVAILABLE => PropertyResource::make($this->property),
                Favorite::REMOVED => null,
                default => [
                    'id' => $this->property->id,
                    'slug' => $this->property->slug,
                    'title' => $this->property->title,
                ],
            }),
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
