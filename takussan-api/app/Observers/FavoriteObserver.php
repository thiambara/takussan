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
