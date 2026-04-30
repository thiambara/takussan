<?php

namespace App\Observers;

use App\Models\Favorite;

class FavoriteObserver
{
    public function created(Favorite $favorite): void
    {
        $favorite->property()->increment('favorites_count');
    }

    public function deleted(Favorite $favorite): void
    {
        $favorite->property()->decrement('favorites_count');
    }
}
