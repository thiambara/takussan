<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\IdType;
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
    ];

    protected $casts = [
        'id_type' => IdType::class,
        'status' => CustomerStatus::class,
        'pipeline_stage' => CustomerPipelineStage::class,
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['user_id', 'agency_id', 'added_by_id', 'status', 'pipeline_stage'];

    protected static array $requestSortable = ['id', 'created_at', 'first_name', 'last_name', 'status'];

    protected static array $requestLoadable = ['user', 'agency', 'addresses', 'tags', 'addedBy', 'notes', 'documents', 'tasks'];

    protected static array $requestCountable = ['bookings', 'leases', 'notes', 'tasks'];

    protected static array $requestSearchFields = ['first_name', 'last_name', 'email', 'phone'];

    protected static array $queryFields = [
        'id', 'user_id', 'agency_id', 'added_by_id',
        'first_name', 'last_name', 'email', 'phone',
        'id_type', 'id_number', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone',
        'status', 'pipeline_stage', 'metadata',
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

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * TCK-281 — n'indexe que l'id et les champs de `$requestSearchFields`.
     * Les colonnes sensibles (`id_number`, `metadata`, `emergency_contact_*`)
     * ne partent JAMAIS vers Meilisearch : l'index est un second magasin, hors
     * MySQL, et tout ce qu'on y pousse en sort du périmètre de la base.
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
