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
 *
 * TCK-2507 — `price_change` : prix courant − `price_at_favorite`, pour un bien `available` seulement (un bien sorti
 * du public ne dit aucun prix, pas même un écart), `null` quand l'un des deux prix manque (favori antérieur à la
 * colonne : `null`, jamais 0). `price_at_favorite` lui-même ne sort pas, par la règle ci-dessus : seul l'écart sort.
 * Calculé en centimes entiers ({@see Favorite::cents()}), jamais en flottant ; émis comme `price` l'est.
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
            'price_change' => $availability === Favorite::AVAILABLE ? $this->priceChange() : null,
            'created_at' => $this->iso($this->created_at),
        ];
    }

    private function priceChange(): int|float|null
    {
        $avant = Favorite::cents($this->resource->getRawOriginal('price_at_favorite'));
        $maintenant = Favorite::cents($this->property?->getRawOriginal('price'));
        if ($avant === null || $maintenant === null) {
            return null;
        }

        return ($maintenant - $avant) / 100;
    }
}
