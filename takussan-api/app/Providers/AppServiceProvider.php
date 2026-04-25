<?php

namespace App\Providers;

use App\Listeners\Payments\LemonSqueezyEventListener;
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
use App\Observers\UserObserver;
use App\Policies\MediaPolicy;
use App\Policies\PropertyPolicy;
use App\Services\Formatting\CurrencyFormatter;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Listeners\SendEmailVerificationNotification;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use LemonSqueezy\Laravel\Events\OrderCreated as LemonSqueezyOrderCreated;
use LemonSqueezy\Laravel\Events\OrderRefunded as LemonSqueezyOrderRefunded;
use LemonSqueezy\Laravel\Events\SubscriptionCreated as LemonSqueezySubscriptionCreated;
use SocialiteProviders\Manager\SocialiteWasCalled;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // TCK-084 — share a single CurrencyFormatter so both the Blade
        // directive and any controller/service can resolve the same instance.
        $this->app->singleton(CurrencyFormatter::class);
    }

    public function boot(Dispatcher $events): void
    {
        Property::observe(PropertyObserver::class);
        Message::observe(MessageObserver::class);
        Favorite::observe(FavoriteObserver::class);
        Review::observe(ReviewObserver::class);
        Lease::observe(LeaseObserver::class);
        PropertyVisit::observe(PropertyVisitObserver::class);
        User::observe(UserObserver::class);

        Gate::before(fn (?User $user) => $user?->hasRole('super_admin') ? true : null);

        // Spatie Media lives outside App\Models so auto-discovery misses it.
        Gate::policy(Media::class, MediaPolicy::class);

        // TCK-074 — explicit bind so `$user->can('duplicate', $property)` resolves.
        Gate::policy(Property::class, PropertyPolicy::class);

        // TCK-084 — `@currency($amount, $currency)` Blade directive used by
        // PDF templates. Accepts either a Currency enum case or its string
        // value so existing templates that thread `$invoice->currency` (a
        // BackedEnum) keep compiling. Falls back to XOF for legacy rows.
        Blade::directive('currency', function (string $expression): string {
            return "<?php echo \\App\\Support\\Blade\\CurrencyDirective::render({$expression}); ?>";
        });

        $events->listen(SocialiteWasCalled::class, 'SocialiteProviders\\Apple\\AppleExtendSocialite@handle');
        $events->listen(SocialiteWasCalled::class, 'SocialiteProviders\\Facebook\\FacebookExtendSocialite@handle');

        // TCK-079 — bridge lemonsqueezy/laravel webhook events onto our
        // domain payment gateway service. The package validates X-Signature
        // upstream; we only need to map events to local payment rows.
        Event::listen(LemonSqueezyOrderCreated::class, [LemonSqueezyEventListener::class, 'handleOrderCreated']);
        Event::listen(LemonSqueezyOrderRefunded::class, [LemonSqueezyEventListener::class, 'handleOrderRefunded']);
        Event::listen(LemonSqueezySubscriptionCreated::class, [LemonSqueezyEventListener::class, 'handleSubscriptionCreated']);

        // TCK-022: dispatch the email verification notification on user
        // registration (Laravel no longer auto-registers this in the
        // "modern" bootstrap structure).
        $events->listen(Registered::class, SendEmailVerificationNotification::class);

        // TCK-022: build the password reset URL against the configured
        // frontend URL — avoids depending on a named route defined in
        // another host (`password.reset`).
        ResetPassword::createUrlUsing(function (object $notifiable, string $token): string {
            $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

            return $frontend.'/reset-password?token='.$token.'&email='.urlencode($notifiable->getEmailForPasswordReset());
        });
    }
}
