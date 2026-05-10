<?php

namespace App\Providers;

use App\Events\Accounting\BankStatementFinalized;
use App\Events\Accounting\BankStatementImported;
use App\Events\Lease\LeaseActivated;
use App\Events\Lease\LeaseDepositRefunded;
use App\Events\Lease\LeaseEarlyTerminationCancelled;
use App\Events\Lease\LeaseEarlyTerminationConfirmed;
use App\Events\Lease\LeaseEarlyTerminationRequested;
use App\Events\Lease\LeasePaymentLateFeeApplied;
use App\Events\Lease\LeaseRenewed;
use App\Events\Lease\LeaseRentReviewed;
use App\Events\Permissions\RoleDelegationActivated;
use App\Events\Permissions\RoleDelegationExpired;
use App\Events\Permissions\RoleDelegationRevoked;
use App\Listeners\Accounting\NotifyStatementFinalized;
use App\Listeners\Accounting\NotifyStatementImported;
use App\Listeners\Admin\DispatchAlerts;
use App\Listeners\Admin\RecordScheduledTaskRun;
use App\Listeners\Lease\CreateTenantOnboardingChecklist;
use App\Listeners\Lease\NotifyOnEarlyTermination;
use App\Listeners\Lease\NotifyTenantOfDepositRefund;
use App\Listeners\Lease\NotifyTenantOfLateFee;
use App\Listeners\Lease\NotifyTenantOfRenewal;
use App\Listeners\Lease\NotifyTenantOfRentReview;
use App\Listeners\Lease\SendTenantWelcomeNotification;
use App\Listeners\Media\ApplyWatermarkOnConversionListener;
use App\Listeners\Payments\LemonSqueezyEventListener;
use App\Listeners\Permissions\NotifyDelegationActivated;
use App\Listeners\Permissions\NotifyDelegationExpired;
use App\Listeners\Permissions\NotifyDelegationRevoked;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\BookingPayment;
use App\Models\Conversation;
use App\Models\Favorite;
use App\Models\Inventory;
use App\Models\Invitation;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Message;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Notifications\Channels\SmsChannel;
use App\Observers\FavoriteObserver;
use App\Observers\InventoryOnboardingObserver;
use App\Observers\LeaseObserver;
use App\Observers\LeasePaymentOnboardingObserver;
use App\Observers\MediaCdnObserver;
use App\Observers\MessageObserver;
use App\Observers\PaymentPlatformFeeObserver;
use App\Observers\PropertyObserver;
use App\Observers\PropertyVisitObserver;
use App\Observers\ReviewObserver;
use App\Observers\UserObserver;
use App\Policies\ActivityLogPolicy;
use App\Policies\AgencyUpgradeRequestPolicy;
use App\Policies\AgentProfilePolicy;
use App\Policies\ConversationPolicy;
use App\Policies\InvitationPolicy;
use App\Policies\LeasePolicy;
use App\Policies\MediaPolicy;
use App\Policies\OwnerProfilePolicy;
use App\Policies\Profiles\ServiceProviderProfilePolicy;
use App\Policies\PropertyModerationPolicy;
use App\Policies\PropertyPolicy;
use App\Policies\RoleDelegationPolicy;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Media\Cdn\BunnyCdnDriver;
use App\Services\Media\Cdn\CdnHealthGuard;
use App\Services\Media\Cdn\CdnProviderContract;
use App\Services\Media\Cdn\CloudflareCdnDriver;
use App\Services\Media\MediaUrlResolver;
use App\Services\Notifications\Sms\Drivers\LAfricaMobileSmsDriver;
use App\Services\Notifications\Sms\Drivers\LogSmsDriver;
use App\Services\Notifications\Sms\Drivers\MtargetSmsDriver;
use App\Services\Notifications\Sms\Drivers\OrangeSmsDriver;
use App\Services\Notifications\Sms\IntegrationLocator;
use App\Services\Notifications\Sms\OperatorResolver;
use App\Services\Notifications\Sms\OrangeDailyCapTracker;
use App\Services\Notifications\Sms\OrangeOAuthTokenCache;
use App\Services\Notifications\Sms\QuietHoursGuard;
use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Notifications\Sms\SmsRouterDriver;
use App\Services\Reporting\PlatformReportingService;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Listeners\SendEmailVerificationNotification;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Http\Request;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use LemonSqueezy\Laravel\Events\OrderCreated as LemonSqueezyOrderCreated;
use LemonSqueezy\Laravel\Events\OrderRefunded as LemonSqueezyOrderRefunded;
use LemonSqueezy\Laravel\Events\SubscriptionCreated as LemonSqueezySubscriptionCreated;
use SocialiteProviders\Manager\SocialiteWasCalled;
use Spatie\Activitylog\Models\Activity;
use Spatie\MediaLibrary\Conversions\Events\ConversionHasBeenCompletedEvent;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // TCK-084 — share a single CurrencyFormatter so both the Blade
        // directive and any controller/service can resolve the same instance.
        $this->app->singleton(CurrencyFormatter::class);

        // TCK-105 — CDN layer. The contract is bound to the active provider
        // from config. MediaUrlResolver and CdnHealthGuard are singletons so
        // the circuit-breaker counter survives across multiple URL resolutions
        // within the same request.
        $this->app->singleton(CdnHealthGuard::class);
        $this->app->singleton(CdnProviderContract::class, function ($app): CdnProviderContract {
            return match ((string) $app['config']->get('cdn.provider', 'bunny')) {
                'cloudflare' => $app->make(CloudflareCdnDriver::class),
                default => $app->make(BunnyCdnDriver::class),
            };
        });
        $this->app->singleton(MediaUrlResolver::class, function ($app): MediaUrlResolver {
            return new MediaUrlResolver(
                cdn: $app->make(CdnProviderContract::class),
                guard: $app->make(CdnHealthGuard::class),
            );
        });

        // TCK-102 — register the multi-provider SMS stack. Each leaf
        // driver is a singleton so its in-process state (Mtarget batch
        // counter, LAM ret_url cache, etc.) survives across notifications
        // dispatched in the same request. The router collects them by id.
        $this->app->singleton(IntegrationLocator::class);
        $this->app->singleton(OperatorResolver::class);
        $this->app->singleton(QuietHoursGuard::class);
        $this->app->singleton(OrangeDailyCapTracker::class);
        $this->app->singleton(OrangeOAuthTokenCache::class);
        $this->app->singleton(LogSmsDriver::class);
        $this->app->singleton(OrangeSmsDriver::class);
        $this->app->singleton(MtargetSmsDriver::class);
        $this->app->singleton(LAfricaMobileSmsDriver::class);
        $this->app->singleton(SmsRouterDriver::class, function ($app): SmsRouterDriver {
            return new SmsRouterDriver(
                drivers: [
                    'orange' => $app->make(OrangeSmsDriver::class),
                    'mtarget' => $app->make(MtargetSmsDriver::class),
                    'lafricamobile' => $app->make(LAfricaMobileSmsDriver::class),
                    'log' => $app->make(LogSmsDriver::class),
                ],
                operators: $app->make(OperatorResolver::class),
                quietHours: $app->make(QuietHoursGuard::class),
                orangeCap: $app->make(OrangeDailyCapTracker::class),
                integrations: $app->make(IntegrationLocator::class),
                config: $app->make('config'),
            );
        });
        // The interface resolves to whatever driver is active in this
        // env: in `local`/`testing` we default to log-only, otherwise the
        // router orchestrates the real providers.
        $this->app->bind(SmsDriverInterface::class, function ($app): SmsDriverInterface {
            $default = (string) $app['config']->get('sms.default_driver', 'router');

            return match ($default) {
                'log' => $app->make(LogSmsDriver::class),
                default => $app->make(SmsRouterDriver::class),
            };
        });
    }

    public function boot(Dispatcher $events): void
    {
        // TCK-141 — `$request->activeProfile()` reads the profile resolved by
        // `ResolveActiveProfile`. Returns null on routes the middleware did
        // not run on (public/auth-less endpoints).
        Request::macro('activeProfile', function () {
            /** @var Request $this */
            return $this->attributes->get('active_profile');
        });

        // TCK-107 — named rate limiter; key is "search-suggest|{ip}" (Laravel default for named limiters).
        RateLimiter::for('search-suggest', fn () => Limit::perMinute(60));

        Property::observe(PropertyObserver::class);
        Message::observe(MessageObserver::class);
        Favorite::observe(FavoriteObserver::class);
        Review::observe(ReviewObserver::class);
        Lease::observe(LeaseObserver::class);
        PropertyVisit::observe(PropertyVisitObserver::class);
        User::observe(UserObserver::class);
        BookingPayment::observe(PaymentPlatformFeeObserver::class);
        LeasePayment::observe(PaymentPlatformFeeObserver::class);

        // TCK-266 — onboarding checklist auto-completion observers.
        // Inventory.signed (move-in) → inventory_completed item ;
        // LeasePayment first effective payment → first_payment item.
        Inventory::observe(InventoryOnboardingObserver::class);
        LeasePayment::observe(LeasePaymentOnboardingObserver::class);

        // TCK-227 — bump the reporting cache version on agency creation so
        // every cached growth/revenue/cohort key cold-misses next call.
        Agency::created(fn () => PlatformReportingService::bumpCacheVersion());
        Activity::created(fn (Activity $activity) => app(DispatchAlerts::class)->handle($activity));
        Event::listen(ScheduledTaskFinished::class, RecordScheduledTaskRun::class);

        // TCK-105 — purge CDN cache when a media item is deleted or replaced.
        Media::observe(MediaCdnObserver::class);

        // TCK-144 — Probe under team_id=null. Without `isSuperAdmin()` here a
        // super-admin acting under an agency context (e.g. via `X-Profile-Id`)
        // would silently lose the gate-bypass — `Gate::before` runs at whatever
        // team the registrar happens to be on at policy-check time.
        Gate::before(fn (?User $user) => $user?->isSuperAdmin() ? true : null);

        // Spatie Media lives outside App\Models so auto-discovery misses it.
        Gate::policy(Media::class, MediaPolicy::class);

        // TCK-104 — Spatie Activity also lives outside App\Models.
        Gate::policy(Activity::class, ActivityLogPolicy::class);

        // TCK-074 — explicit bind so `$user->can('duplicate', $property)` resolves.
        Gate::policy(Property::class, PropertyPolicy::class);

        // TCK-085 — group conversation gates (admin-only mutations + system-message immutability).
        Gate::policy(Conversation::class, ConversationPolicy::class);

        // TCK-088 — explicit bind for `$user->can('refundDeposit', $lease)`.
        Gate::policy(Lease::class, LeasePolicy::class);

        // TCK-108 — role delegation policy (agency-scoped admin checks).
        Gate::policy(RoleDelegation::class, RoleDelegationPolicy::class);

        // TCK-249 — invitation policy (revoke/resend custom abilities not
        // covered by BasePolicy's CRUD set).
        Gate::policy(Invitation::class, InvitationPolicy::class);

        // TCK-256 — owner invitation gate (custom `invite` ability that
        // takes the Agency as second argument). Bound explicitly because
        // the action is not on the OwnerProfile model itself.
        Gate::policy(OwnerProfile::class, OwnerProfilePolicy::class);

        // TCK-267 — agency upgrade request gates. `create` and `viewAny`
        // both take the Agency as second argument; `view` and `revoke`
        // operate on the request directly. Bound explicitly because the
        // gate signatures don't match the implicit auto-discovery pattern.
        Gate::policy(AgencyUpgradeRequest::class, AgencyUpgradeRequestPolicy::class);

        // TCK-258 — agent profile gates (custom `invite`, `suspend`,
        // `delete` abilities). `invite` takes the Agency as second arg
        // (mirrors OwnerProfilePolicy@invite).
        Gate::policy(AgentProfile::class, AgentProfilePolicy::class);

        // TCK-260 — service provider profile gates (custom `invite`
        // ability that takes the Agency as second arg). Bound explicitly
        // because the action is not on the SP profile itself and the
        // policy lives in App\Policies\Profiles (auto-discovery only
        // probes App\Policies for `App\Models\Profiles\X` → `App\Policies\XPolicy`).
        Gate::policy(ServiceProviderProfile::class, ServiceProviderProfilePolicy::class);

        // TCK-098 — property moderation gates (approve, reject, resubmit).
        // Named gates avoid collision with the existing PropertyPolicy.
        Gate::define('approve-property', [PropertyModerationPolicy::class, 'approve']);
        Gate::define('reject-property', [PropertyModerationPolicy::class, 'reject']);
        Gate::define('resubmit-property', [PropertyModerationPolicy::class, 'resubmit']);
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
        // TCK-087 — fire tenant notification when a late fee is applied.
        Event::listen(LeasePaymentLateFeeApplied::class, NotifyTenantOfLateFee::class);

        Event::listen(LemonSqueezyOrderCreated::class, [LemonSqueezyEventListener::class, 'handleOrderCreated']);
        Event::listen(LemonSqueezyOrderRefunded::class, [LemonSqueezyEventListener::class, 'handleOrderRefunded']);
        Event::listen(LemonSqueezySubscriptionCreated::class, [LemonSqueezyEventListener::class, 'handleSubscriptionCreated']);

        // TCK-088 — notify the tenant when their lease deposit is refunded.
        $events->listen(LeaseDepositRefunded::class, NotifyTenantOfDepositRefund::class);

        // TCK-089 — notify the tenant when their lease has been renewed.
        $events->listen(LeaseRenewed::class, NotifyTenantOfRenewal::class);

        // TCK-090 — notify stakeholders on every early-termination transition.
        $events->listen(LeaseEarlyTerminationRequested::class, [NotifyOnEarlyTermination::class, 'handleRequested']);
        $events->listen(LeaseEarlyTerminationCancelled::class, [NotifyOnEarlyTermination::class, 'handleCancelled']);
        $events->listen(LeaseEarlyTerminationConfirmed::class, [NotifyOnEarlyTermination::class, 'handleConfirmed']);

        // TCK-091 — notify the tenant when the rent on their lease is reviewed.
        $events->listen(LeaseRentReviewed::class, NotifyTenantOfRentReview::class);

        // TCK-265 — welcome the tenant the first time their lease is activated.
        $events->listen(LeaseActivated::class, SendTenantWelcomeNotification::class);

        // TCK-266 — also kick off the onboarding checklist on activation
        // (independent listener: welcome notification can be skipped per
        // user preference, the checklist must always be created).
        $events->listen(LeaseActivated::class, CreateTenantOnboardingChecklist::class);

        // TCK-108 — notify on role delegation lifecycle events.
        Event::listen(RoleDelegationActivated::class, NotifyDelegationActivated::class);
        Event::listen(RoleDelegationExpired::class, NotifyDelegationExpired::class);
        Event::listen(RoleDelegationRevoked::class, NotifyDelegationRevoked::class);

        // TCK-106 — apply watermark after Spatie generates each conversion.
        Event::listen(ConversionHasBeenCompletedEvent::class, ApplyWatermarkOnConversionListener::class);

        // TCK-109 — bank reconciliation event listeners.
        Event::listen(BankStatementImported::class, NotifyStatementImported::class);
        Event::listen(BankStatementFinalized::class, NotifyStatementFinalized::class);

        // TCK-022: dispatch the email verification notification on user
        // registration (Laravel no longer auto-registers this in the
        // "modern" bootstrap structure).
        $events->listen(Registered::class, SendEmailVerificationNotification::class);

        // TCK-230 — the email opens on the frontend, but the signature is
        // generated for the API route that ultimately validates it.
        VerifyEmail::createUrlUsing(function (object $notifiable): string {
            $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');
            $apiPath = URL::temporarySignedRoute(
                'verification.verify',
                now()->addMinutes(config('auth.verification.expire', 60)),
                [
                    'id' => $notifiable->getKey(),
                    'hash' => sha1($notifiable->getEmailForVerification()),
                ],
                false
            );

            return $frontend.str_replace('/api/auth/verify-email', '/auth/verify-email', $apiPath);
        });

        // TCK-102 — register the `sms` notification channel so any
        // Notification can list `SmsChannel::class` (or simply `'sms'`
        // via Notifiable::notify) in its via() return.
        $this->app->make(ChannelManager::class)->extend('sms', fn ($app) => $app->make(SmsChannel::class));

        // TCK-022: build the password reset URL against the configured
        // frontend URL — avoids depending on a named route defined in
        // another host (`password.reset`).
        ResetPassword::createUrlUsing(function (object $notifiable, string $token): string {
            $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

            return $frontend.'/auth/reset-password?token='.$token.'&email='.urlencode($notifiable->getEmailForPasswordReset());
        });
    }
}
