<?php

namespace App\Models;

use App\Models\Concerns\HasMediaConversions;
use App\Models\Concerns\HasProfiles;
use App\Models\Concerns\HasQueryBuilder;
use App\Models\Enums\EmailFrequency;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Notifications\RegistrationConfirmationNotification;
use App\Notifications\ResetPasswordNotification;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Contracts\Translation\HasLocalePreference;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasOneThrough;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\Permission\PermissionRegistrar;
use Spatie\Permission\Traits\HasRoles;
use Spatie\QueryBuilder\AllowedFilter;

class User extends Authenticatable implements HasLocalePreference, HasMedia, MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasProfiles, HasQueryBuilder, HasRoles, InteractsWithMedia, LogsActivity, Notifiable, SoftDeletes;

    use HasMediaConversions {
        HasMediaConversions::registerMediaConversions insteadof InteractsWithMedia;
    }

    protected $fillable = [
        'username', 'first_name', 'last_name', 'status',
        'email', 'password', 'phone',
        'bio', 'preferred_language', 'timezone',
        'last_login_at', 'added_by_id',
        'google_id', 'facebook_id', 'apple_id',
        'two_factor_enabled', 'two_factor_secret', 'two_factor_recovery_codes',
        'phone_verified_at',
        'notifications_email_enabled', 'notifications_push_enabled', 'notifications_sms_enabled',
        'email_frequency', 'digest_send_at', 'digest_day_of_week',
        'metadata',
        'deletion_requested_at',
        // TCK-142 — kept fillable so the legacy `agency_id` mutator gets a
        // chance to run during `update()` / `fill()`. The mutator itself
        // never writes to the (now-dropped) column; it just maps the value
        // onto an OwnerProfile row.
        'agency_id',
    ];

    protected $hidden = [
        'password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes',
    ];

    /**
     * Normalize email to lowercase on every write so the unique index and
     * all lookups are case-insensitive by construction.
     */
    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value !== null
            ? strtolower(trim($value))
            : null;
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'deletion_requested_at' => 'datetime',
            'password' => 'hashed',
            'status' => UserStatus::class,
            'two_factor_enabled' => 'boolean',
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted',
            'notifications_email_enabled' => 'boolean',
            'notifications_push_enabled' => 'boolean',
            'notifications_sms_enabled' => 'boolean',
            'email_frequency' => EmailFrequency::class,
            'metadata' => 'array',
        ];
    }

    protected static array $requestFilterable = ['status', 'added_by_id'];

    protected static array $requestSortable = ['id', 'created_at', 'first_name', 'last_name', 'email', 'status'];

    /**
     * TCK-147 — expose the agency-scoped profile relations and the spatie
     * `roles` relation so admin UIs can request `include=agentProfiles,
     * ownerProfiles,roles` and render the membership/role columns without a
     * second round-trip.
     */
    protected static array $requestLoadable = ['agentProfiles', 'ownerProfiles', 'roles'];

    /**
     * TCK-147 — register a `role` callback filter so `?filter[role]=agent`
     * isn't rejected with HTTP 400 before reaching the query. Spatie roles
     * live on a relation, not a column, so the trait's exact/partial/range
     * mechanisms don't apply.
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback(
                'role',
                fn (Builder $q, string $value) => $q->whereHas(
                    'roles',
                    fn (Builder $rq) => $rq->where('name', $value),
                ),
            ),
        ];
    }

    protected static array $requestSearchFields = ['first_name', 'last_name', 'email', 'username', 'phone'];

    protected static array $queryFields = [
        'id', 'username', 'first_name', 'last_name', 'roles', 'email', 'phone',
        'status', 'bio', 'preferred_language',
        'timezone', 'last_login_at', 'created_at', 'updated_at',
    ];

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * TCK-142 — agency attachment is now carried by polymorphic profiles. The
     * accessor preserves the legacy `$user->agency_id` property surface used
     * by policies, controllers and resources during the transition window.
     *
     * Resolution order (TCK-146):
     *   1. Active profile (set by `ResolveActiveProfile` middleware) — the
     *      authoritative HTTP-time answer.
     *   2. **Auto-bascule**: when the user holds *exactly one* agency-scoped
     *      profile, return that one. Mirrors the middleware's auto-pick for
     *      single-profile users and keeps jobs / console / listeners working.
     *   3. `null` — multi-profile users without an explicit context, and
     *      admins with no profile. Earlier the accessor fell back to the
     *      *first* of N profiles which silently leaked access across
     *      tenants; security-sensitive call-sites should now read
     *      `$user->activeProfile()?->agency_id` directly to be explicit.
     *
     * Returns null for users with no agency-scoped profile (admins).
     */
    public function getAgencyIdAttribute(): ?int
    {
        $active = $this->activeProfile();
        if ($active !== null && isset($active->agency_id)) {
            return $active->agency_id;
        }

        // Auto-bascule mirrors `ResolveActiveProfile` — exactly one profile
        // (any of the four types). `profiles()` reuses eager-loaded
        // relations when available so a per-row authz check inside an
        // index loop doesn't fan out into N×3 queries; the trait method
        // also keeps this accessor in lockstep with the middleware's
        // single-profile rule for users holding e.g. one broker profile.
        $profiles = $this->profiles();
        if ($profiles->count() !== 1) {
            return null;
        }

        $only = $profiles->first();

        return isset($only->agency_id) ? (int) $only->agency_id : null;
    }

    /**
     * TCK-142 — Backward-compat write side: legacy callers and tests still
     * issue `$user->update(['agency_id' => X])` to attach a user to an
     * agency. Without a column to write to, that becomes a silent no-op
     * and downstream policies break. We shim the assignment by ensuring
     * an OwnerProfile exists for the (user, agency) pair.
     *
     * `null` is a no-op — the previous behavior (deleting *every* owner
     * and agent profile) was destructive once a single user could hold
     * profiles at multiple agencies. Removing a user from a specific
     * agency now requires the explicit profile API (e.g. `removeAgent`).
     */
    public function setAgencyIdAttribute(?int $value): void
    {
        if (! $this->exists) {
            // Pre-save assignments (factory state merges, `new User([...])`,
            // `User::create([...])`) can't create a profile yet — there's
            // no FK target. Stash the value; the `created` model observer
            // below picks it up once the row is persisted.
            UserFactory::stashLegacyAgency($this, $value);

            return;
        }

        if ($value === null) {
            return;
        }

        OwnerProfile::query()->firstOrCreate(
            ['user_id' => $this->id, 'agency_id' => $value],
        );
    }

    /**
     * TCK-144 — `super_admin` is always assigned under `team_id = null`
     * (it's a global role). Probing it under whatever team the registrar
     * happens to be on right now would silently miss the role for any
     * super-admin who is also acting inside an agency context (e.g. via
     * `X-Profile-Id`). This helper pins the team probe to null and
     * restores the previous context, so callers don't have to.
     */
    public function isSuperAdmin(): bool
    {
        $registrar = app(PermissionRegistrar::class);
        $previous = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId(null);
        $this->unsetRelation('roles');
        try {
            return $this->hasRole('super_admin');
        } finally {
            $registrar->setPermissionsTeamId($previous);
            $this->unsetRelation('roles');
        }
    }

    protected static function booted(): void
    {
        // TCK-142 — flush any legacy `agency_id` value stashed before save
        // into a real OwnerProfile row. Covers `User::create(['agency_id' =>
        // X])`, `new User(['agency_id' => X]) + ->save()`, and any other
        // path that bypasses the factory's afterCreating hook.
        static::created(function (self $user): void {
            $agencyId = UserFactory::popLegacyAgency($user);
            if ($agencyId !== null) {
                OwnerProfile::query()->firstOrCreate(
                    ['user_id' => $user->id, 'agency_id' => $agencyId],
                );
            }
        });
    }

    /**
     * Whitelist: `password`, `remember_token`, and 2FA secrets are absent on
     * purpose — they must never reach the activity log. The
     * `dontLogIfAttributesChangedOnly` guard additionally short-circuits
     * activity creation when a save only touched sensitive/mechanical fields.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'username', 'email', 'first_name', 'last_name', 'phone',
                'status', 'preferred_language', 'timezone',
                'email_verified_at', 'phone_verified_at',
                'two_factor_enabled',
                'notifications_email_enabled',
                'notifications_push_enabled',
                'notifications_sms_enabled',
                'deletion_requested_at',
            ])
            ->logOnlyDirty()
            ->dontLogIfAttributesChangedOnly([
                'password', 'remember_token',
                'two_factor_secret', 'two_factor_recovery_codes',
                'updated_at', 'last_login_at',
            ])
            ->dontLogEmptyChanges();
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('avatar')->singleFile();
        $this->addMediaCollection('avatars')->singleFile();
        $this->addMediaCollection('photos');
        $this->addMediaCollection('documents');
    }

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'added_by_id');
    }

    /**
     * TCK-142 — direct agency FK is gone. The relation is now expressed
     * through the user's agent profile, which carries the agency FK. Returns
     * the first agency the user is an agent of; legacy callers using
     * `$user->agency` or `$user->agency()->...` keep behaving like a single-
     * agency relation.
     */
    public function agency(): HasOneThrough
    {
        return $this->hasOneThrough(
            Agency::class,
            AgentProfile::class,
            'user_id',
            'id',
            'id',
            'agency_id',
        );
    }

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }

    public function customer(): HasOne
    {
        return $this->hasOne(Customer::class);
    }

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'addressable');
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }

    public function favorites(): HasMany
    {
        return $this->hasMany(Favorite::class);
    }

    public function savedSearches(): HasMany
    {
        return $this->hasMany(SavedSearch::class);
    }

    public function appNotifications(): HasMany
    {
        return $this->hasMany(AppNotification::class);
    }

    public function notificationPreferences(): HasMany
    {
        return $this->hasMany(NotificationPreference::class);
    }

    public function leases(): HasMany
    {
        return $this->hasMany(Lease::class, 'landlord_id');
    }

    public function writtenReviews(): HasMany
    {
        return $this->hasMany(Review::class, 'author_id');
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class, 'landlord_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'created_by_id');
    }

    public function bookingPayments(): HasMany
    {
        return $this->hasMany(BookingPayment::class);
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'added_by_id');
    }

    public function customerRelationships(): HasMany
    {
        return $this->hasMany(UserCustomerRelationship::class);
    }

    public function relatedCustomers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'user_customer_relationships');
    }

    public function receivedReviews(): MorphMany
    {
        return $this->morphMany(Review::class, 'reviewable');
    }

    public function conversations()
    {
        return $this->belongsToMany(Conversation::class, 'conversation_participants')
            ->using(ConversationParticipant::class)
            ->withPivot(['role', 'last_read_at', 'is_muted', 'joined_at', 'left_at'])
            ->withTimestamps();
    }

    /**
     * TCK-108 — role delegations where this user is the beneficiary.
     */
    public function roleDelegations(): HasMany
    {
        return $this->hasMany(RoleDelegation::class);
    }

    /**
     * TCK-080 — pending RGPD deletion request (at most one per user, enforced
     * by the UNIQUE on `account_deletion_requests.user_id`).
     */
    public function deletionRequest(): HasOne
    {
        return $this->hasOne(AccountDeletionRequest::class);
    }

    public function hasPendingDeletionRequest(): bool
    {
        return $this->deletion_requested_at !== null;
    }

    /**
     * Override to dispatch our localized ResetPasswordNotification
     * (TCK-022) instead of the Laravel built-in.
     */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }

    /**
     * Locale preference consumed by Laravel's notification pipeline
     * (queued mail/notifications render in the recipient's language
     * without the sender having to call `->locale()` manually).
     */
    public function preferredLocale(): ?string
    {
        return $this->preferred_language ?: null;
    }

    /**
     * Override to dispatch our localized RegistrationConfirmationNotification
     * (TCK-022) instead of the Laravel built-in VerifyEmail notification.
     */
    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new RegistrationConfirmationNotification);
    }
}
