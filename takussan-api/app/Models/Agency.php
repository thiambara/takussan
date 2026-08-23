<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\Currency;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;
use Laravel\Scout\Searchable;
use LemonSqueezy\Laravel\Billable as LemonSqueezyBillable;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class Agency extends AbstractModel implements HasMedia
{
    // TCK-079: Lemon Squeezy `Billable` makes Agency the scope used to
    // create checkouts (`$agency->checkout(...)->withCustomPrice(...)`).
    use HasFactory, InteractsWithMedia, LemonSqueezyBillable, Searchable, SoftDeletes;

    protected $fillable = [
        'name', 'slug', 'kind', 'license_number', 'description',
        'email', 'phone', 'website', 'commission_rate', 'currency',
        'founded_at', 'is_verified', 'verified_at',
        'primary_admin_id', 'status', 'metadata', 'settings',
        'moderation_required', 'bank_csv_mapping',
    ];

    protected $casts = [
        'founded_at' => 'date',
        'is_verified' => 'boolean',
        'verified_at' => 'datetime',
        'commission_rate' => 'decimal:2',
        'average_rating' => 'decimal:2',
        'kind' => AgencyKind::class,
        'status' => AgencyStatus::class,
        'currency' => Currency::class,
        'metadata' => 'array',
        'settings' => 'array',
        'moderation_required' => 'boolean',
        'bank_csv_mapping' => 'array',
    ];

    protected $attributes = [
        'currency' => 'XOF',
    ];

    protected static array $requestFilterable = ['status', 'kind', 'is_verified', 'primary_admin_id'];

    protected static array $requestSortable = ['id', 'name', 'created_at', 'founded_at'];

    protected static array $requestLoadable = ['primaryAdmin', 'addresses'];

    protected static array $requestCountable = ['properties'];

    protected static array $requestSearchFields = ['name', 'email', 'license_number'];

    protected static array $queryFields = [
        'id', 'name', 'slug', 'kind', 'license_number', 'description',
        'email', 'phone', 'website', 'commission_rate', 'currency',
        'founded_at', 'is_verified', 'status', 'moderation_required', 'created_at', 'updated_at',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->slug)) {
                $m->slug = Str::slug($m->name).'-'.Str::random(5);
            }
        });
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('logo')->singleFile();
    }

    /**
     * TCK-281 — n'indexe que l'id et les champs de `$requestSearchFields`.
     *
     * @return array<string,mixed>
     */
    public function toSearchableArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'license_number' => $this->license_number,
        ];
    }

    public function shouldBeSearchable(): bool
    {
        return ! $this->trashed();
    }

    public function primaryAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'primary_admin_id');
    }

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'addressable');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class);
    }

    public function reviews(): MorphMany
    {
        return $this->morphMany(Review::class, 'reviewable');
    }

    public function leases(): HasMany
    {
        return $this->hasMany(Lease::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(AgencySubscription::class);
    }

    public function currentSubscription(): HasOne
    {
        return $this->hasOne(AgencySubscription::class)->whereNull('ended_at')->latestOfMany();
    }

    public function bankStatements(): HasMany
    {
        return $this->hasMany(BankStatement::class);
    }

    public function kycDossier(): MorphOne
    {
        return $this->morphOne(KycDossier::class, 'subject');
    }

    /**
     * Toutes les demandes d'upgrade `individual → standard` jamais soumises
     * par cette agence (tous statuts confondus). Voir TCK-252.
     */
    public function upgradeRequests(): HasMany
    {
        return $this->hasMany(AgencyUpgradeRequest::class);
    }

    /**
     * Demande d'upgrade actuellement `pending` (au plus une — invariant garanti
     * par l'index unique PARTIEL `agency_upgrade_requests_one_pending_per_agency`,
     * cf. {@see AgencyUpgradeRequest}).
     *
     * ⚠ Cette ligne ajoutait « + check applicatif sur SQLite » jusqu'au
     * 2026-08-22 : ce second garde-fou a été supprimé avec SQLite (ADR-0020).
     */
    public function pendingUpgradeRequest(): HasOne
    {
        return $this->hasOne(AgencyUpgradeRequest::class)
            ->where('status', AgencyUpgradeRequestStatus::Pending->value);
    }
}
