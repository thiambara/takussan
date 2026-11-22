<?php

namespace App\Observers;

use App\Models\Favorite;
use App\Models\Property;

class FavoriteObserver
{
    /**
     * TCK-599 §5 — la base d'une alerte de baisse est le prix AU MOMENT de la mise en favori : une
     * baisse antérieure n'est pas une nouvelle. Lue en base (chaîne décimale), jamais en flottant.
     */
    public function creating(Favorite $favorite): void
    {
        if ($favorite->alert_baseline_price === null) {
            $favorite->alert_baseline_price = Property::withTrashed()->whereKey($favorite->property_id)->value('price');
        }
        // TCK-2507 — le prix « depuis l'ajout » : posé ici, une fois, et JAMAIS rebasé (au contraire de la base d'alerte,
        // que `SendFavoriteChangeAlerts` fait suivre le prix). Seulement pour un bien PUBLIC à cet instant (revue du
        // 2026-11-09, décision de la session) : un favori posé sur un brouillon ou un bien privé (bailleur, personnel de
        // l'agence) ne comparera jamais le prix public à un prix que le public n'a pas vu — un agent retiré de l'agence
        // le retrouverait par l'écart. `null`, donc pas d'écart.
        if ($favorite->price_at_favorite === null) {
            $favorite->price_at_favorite = Property::query()->public()->whereKey($favorite->property_id)->value('price');
        }
    }

    public function created(Favorite $favorite): void
    {
        $favorite->property()->increment('favorites_count');
    }

    public function deleted(Favorite $favorite): void
    {
        $favorite->property()->decrement('favorites_count');
    }
}
