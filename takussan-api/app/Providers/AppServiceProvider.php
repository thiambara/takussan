<?php

namespace App\Providers;

use App\Models\Favorite;
use App\Models\Lease;
use App\Models\Message;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Observers\FavoriteObserver;
use App\Observers\LeaseObserver;
use App\Observers\MessageObserver;
use App\Observers\PropertyObserver;
use App\Observers\PropertyVisitObserver;
use App\Observers\ReviewObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        Property::observe(PropertyObserver::class);
        Message::observe(MessageObserver::class);
        Favorite::observe(FavoriteObserver::class);
        Review::observe(ReviewObserver::class);
        Lease::observe(LeaseObserver::class);
        PropertyVisit::observe(PropertyVisitObserver::class);
    }
}
