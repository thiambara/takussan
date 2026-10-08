<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Http\Request;

/**
 * TCK-599 §1 — `availability` dit POURQUOI un favori n'est plus décrit, et `property` ne porte la
 * carte complète que pour un bien `available` : `{id, slug, title}` sinon, `null` s'il est supprimé.
 *
 * `available` se lit sur `property_is_public`, calculé par `scopePublic()` (cf.
 * `FavoriteController::projected()`), jamais recalculé ici.
 */
class FavoriteResource extends BaseResource
{
    public const AVAILABLE = 'available';

    public const RENTED = 'rented';

    public const SOLD = 'sold';

    public const UNAVAILABLE = 'unavailable';

    public const REMOVED = 'removed';

    public function toArray(Request $request): array
    {
        $availability = $this->availability();

        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'user_id' => $this->user_id,
            'notes' => $this->notes,
            'availability' => $availability,
            'property' => $this->whenLoaded('property', fn () => match ($availability) {
                self::AVAILABLE => PropertyResource::make($this->property),
                self::REMOVED => null,
                default => [
                    'id' => $this->property->id,
                    'slug' => $this->property->slug,
                    'title' => $this->property->title,
                ],
            }),
            'created_at' => $this->iso($this->created_at),
        ];
    }

    private function availability(): string
    {
        /** @var Property|null $property */
        $property = $this->relationLoaded('property') ? $this->property : null;

        if ($property === null || $property->trashed()) {
            return self::REMOVED;
        }
        if ((bool) $this->property_is_public) {
            return self::AVAILABLE;
        }

        // Loué ou vendu ne se dit que d'un bien qui serait public sans son statut : le dire d'un
        // bien privé ou de test révélerait un état interne.
        $publicOtherwise = $property->visibility === PropertyVisibility::Public
            && ! $property->is_test
            && $property->published_at !== null;

        return match (true) {
            $publicOtherwise && $property->status === PropertyStatus::Rented => self::RENTED,
            $publicOtherwise && $property->status === PropertyStatus::Sold => self::SOLD,
            default => self::UNAVAILABLE,
        };
    }
}
