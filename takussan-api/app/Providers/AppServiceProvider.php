<?php

namespace App\Providers;

use App\Models\Favorite;
use App\Models\Lease;
use App\Models\Message;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use App\Observers\FavoriteObserver;
use App\Observers\LeaseObserver;
use App\Observers\MessageObserver;
use App\Observers\PropertyObserver;
use App\Observers\PropertyVisitObserver;
use App\Observers\ReviewObserver;
use App\Policies\MediaPolicy;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use SocialiteProviders\Manager\SocialiteWasCalled;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(Dispatcher $events): void
    {
        Property::observe(PropertyObserver::class);
        Message::observe(MessageObserver::class);
        Favorite::observe(FavoriteObserver::class);
        Review::observe(ReviewObserver::class);
        Lease::observe(LeaseObserver::class);
        PropertyVisit::observe(PropertyVisitObserver::class);

        Gate::before(fn (?User $user) => $user?->hasRole('super_admin') ? true : null);

        // Spatie Media lives outside App\Models so auto-discovery misses it.
        Gate::policy(Media::class, MediaPolicy::class);

        $events->listen(SocialiteWasCalled::class, 'SocialiteProviders\\Apple\\AppleExtendSocialite@handle');
    }
}
