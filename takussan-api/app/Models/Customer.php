<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\Capability;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\IdType;
use App\Services\Crm\CustomerPhoneNormalizer;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Scout\Searchable;
use Spatie\Activitylog\Support\LogOptions;
use Spatie\QueryBuilder\AllowedFilter;

class Customer extends AbstractModel
{
    use Auditable, HasFactory, Searchable, SoftDeletes;

    /**
     * Override the default Auditable whitelist to exclude the `id_number`
     * field (government ID), which is sensitive and should not be surfaced
     * in the activity log payloads.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'user_id', 'agency_id', 'added_by_id',
                'first_name', 'last_name', 'email', 'phone',
                'id_type', 'occupation',
                'emergency_contact_name', 'emergency_contact_phone',
                'status', 'pipeline_stage',
            ])
            ->logOnlyDirty()
            ->dontLogIfAttributesChangedOnly(['id_number', 'notes', 'metadata', 'updated_at'])
            ->dontLogEmptyChanges()
            ->useLogName(class_basename(static::class));
    }

    protected $fillable = [
        'user_id', 'agency_id', 'added_by_id',
        'first_name', 'last_name', 'email', 'phone',
        'id_type', 'id_number', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone',
        'status', 'pipeline_stage', 'notes', 'metadata',
        // TCK-591 — critères de recherche du prospect.
        'seeking_contract_type', 'budget_min', 'budget_max',
        'seeking_property_types', 'seeking_cities', 'seeking_neighborhoods', 'min_bedrooms',
    ];

    protected $casts = [
        'id_type' => IdType::class,
        'status' => CustomerStatus::class,
        'pipeline_stage' => CustomerPipelineStage::class,
        'metadata' => 'array',
        'budget_min' => 'decimal:2',
        'budget_max' => 'decimal:2',
        'seeking_property_types' => 'array',
        'seeking_cities' => 'array',
        'seeking_neighborhoods' => 'array',
        'min_bedrooms' => 'integer',
    ];

    /**
     * TCK-591 — tout chemin d'écriture normalise le téléphone (formulaire, `findOrCreateFromUser`,
     * conversion de lead) : la règle vit sur l'attribut, pas dans chaque appelant.
     */
    public function setPhoneAttribute(?string $value): void
    {
        $this->attributes['phone'] = CustomerPhoneNormalizer::normalize($value);
    }

    public function setEmergencyContactPhoneAttribute(?string $value): void
    {
        $this->attributes['emergency_contact_phone'] = CustomerPhoneNormalizer::normalize($value);
    }

    protected static array $requestFilterable = ['user_id', 'agency_id', 'added_by_id', 'status', 'pipeline_stage'];

    protected static array $requestSortable = ['id', 'created_at', 'updated_at', 'first_name', 'last_name', 'status'];

    protected static array $requestLoadable = ['user', 'agency', 'addresses', 'tags', 'addedBy', 'notes', 'documents', 'tasks'];

    protected static array $requestCountable = ['bookings', 'leases', 'notes', 'tasks'];

    protected static array $requestSearchFields = ['first_name', 'last_name', 'email', 'phone'];

    protected static array $queryFields = [
        'id', 'user_id', 'agency_id', 'added_by_id',
        'first_name', 'last_name', 'email', 'phone',
        'id_type', 'id_number', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone',
        'status', 'pipeline_stage', 'metadata',
        'seeking_contract_type', 'budget_min', 'budget_max',
        'seeking_property_types', 'seeking_cities', 'seeking_neighborhoods', 'min_bedrooms',
        'created_at', 'updated_at',
    ];

    /** @return array<int, AllowedFilter> */
    protected static function getAllowedQueryFilters(): array
    {
        $filters = parent::getAllowedQueryFilters();

        $filters[] = AllowedFilter::callback('tags', function (Builder $q, mixed $value) {
            $names = is_array($value) ? $value : explode(',', (string) $value);
            $names = array_filter(array_map('trim', $names));
            if (empty($names)) {
                return;
            }
            $q->whereHas('tags', fn (Builder $t) => $t->whereIn('name', $names));
        });

        $filters[] = AllowedFilter::callback('tags_all', function (Builder $q, mixed $value) {
            $names = is_array($value) ? $value : explode(',', (string) $value);
            $names = array_filter(array_map('trim', $names));
            foreach ($names as $name) {
                $q->whereHas('tags', fn (Builder $t) => $t->where('name', $name));
            }
        });

        return $filters;
    }

    /**
     * TCK-591 §9 — les fiches qu'un utilisateur peut LIRE, en une requête : exactement la règle de
     * `CustomerPolicy::view` (TCK-587). Super-admin → tout ; personnel de l'agence de son profil
     * actif tenant `crm.view_all` → l'agence, plus ses propres ajouts ; tout autre compte (personnel
     * sans la capacité, bailleur, client) → ses seuls ajouts.
     *
     * TCK-591 (verif-591 M1) — « ses ajouts » : ceux d'une agence dont il est encore MEMBRE actif,
     * ou hors agence (`CustomerPolicy::view`, même décision).
     *
     * Partagée par `CustomerController::index` et `PipelineStatsService` : le kanban et ses
     * compteurs ne peuvent plus diverger de la fiche. `$user->agency_id` n'y entre pas — c'est
     * l'agence du profil actif QUEL QU'IL SOIT, et un bailleur y lisait tout le CRM.
     *
     * @param  Builder<Customer>  $query
     * @return Builder<Customer>
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $memberAgencyIds = app(MembershipCapabilityResolver::class)->memberAgencyIds($user);
        $ownAdds = fn (Builder $q) => $q->where('added_by_id', $user->id)
            ->where(fn (Builder $a) => $a->whereNull('agency_id')->orWhereIn('agency_id', $memberAgencyIds));

        $staffAgencyId = $user->staffAgencyId();
        if ($staffAgencyId !== null && $user->can(Capability::CrmViewAll->value)) {
            return $query->where(function (Builder $inner) use ($staffAgencyId, $ownAdds) {
                $inner->where('agency_id', $staffAgencyId)->orWhere($ownAdds);
            });
        }

        return $query->where($ownAdds);
    }

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * TCK-281 — n'indexe que l'id et les champs de `$requestSearchFields`.
     * Les colonnes sensibles (`id_number`, `metadata`, `emergency_contact_*`)
     * ne partent JAMAIS vers Meilisearch : l'index est un second magasin, hors
     * de la base, et tout ce qu'on y pousse en sort du périmètre de la base.
     *
     * @return array<string,mixed>
     */
    public function toSearchableArray(): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'phone' => $this->phone,
        ];
    }

    public function shouldBeSearchable(): bool
    {
        return ! $this->trashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by_id');
    }

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'addressable');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function leases(): HasMany
    {
        return $this->hasMany(Lease::class, 'tenant_id');
    }

    /** TCK-591 — les visites rattachées au client (`property_visits.customer_id`). */
    public function visits(): HasMany
    {
        return $this->hasMany(PropertyVisit::class);
    }

    public function leasePayments(): HasMany
    {
        return $this->hasMany(LeasePayment::class, 'payer_id');
    }

    public function relationships(): HasMany
    {
        return $this->hasMany(UserCustomerRelationship::class);
    }

    public function notes(): HasMany
    {
        return $this->hasMany(CustomerNote::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }

    public function tags(): MorphToMany
    {
        return $this->morphToMany(Tag::class, 'taggable');
    }

    /**
     * TCK-083 — CRM tasks attached to this customer (polymorphic).
     */
    public function tasks(): MorphMany
    {
        return $this->morphMany(Task::class, 'taskable');
    }
}
