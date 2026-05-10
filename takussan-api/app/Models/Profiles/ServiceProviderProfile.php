<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\User;
use Database\Factories\Profiles\ServiceProviderProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ServiceProviderProfile extends AbstractModel
{
    /** @use HasFactory<ServiceProviderProfileFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'status',
        'specialties', 'service_areas',
        'insurance_policy_id', 'certifications',
        'hourly_rate_min', 'hourly_rate_max',
        'active_until', 'metadata',
    ];

    protected $casts = [
        'status' => ServiceProviderProfileStatus::class,
        'specialties' => 'array',
        'service_areas' => 'array',
        'certifications' => 'array',
        'hourly_rate_min' => 'decimal:2',
        'hourly_rate_max' => 'decimal:2',
        'active_until' => 'date',
        'metadata' => 'array',
    ];

    /**
     * spatie/laravel-query-builder hooks. Listing surface
     * (`/app/maintenance/providers`) consomme ces filtres + sparse
     * fieldsets côté front — voir CLAUDE.md "API — conventions frontend".
     */
    protected static array $requestFilterable = ['status', 'user_id'];

    protected static array $requestSortable = ['id', 'created_at', 'status'];

    protected static array $requestLoadable = ['user', 'agencyCollaborations', 'agencies', 'invitations'];

    protected static array $requestSearchFields = ['insurance_policy_id'];

    protected static array $queryFields = [
        'id', 'user_id', 'status',
        'specialties', 'service_areas',
        'insurance_policy_id', 'certifications',
        'hourly_rate_min', 'hourly_rate_max',
        'active_until', 'metadata',
        'created_at', 'updated_at',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function agencyCollaborations(): HasMany
    {
        return $this->hasMany(ServiceProviderAgencyCollaboration::class);
    }

    public function agencies(): BelongsToMany
    {
        return $this->belongsToMany(
            Agency::class,
            'service_provider_agency_collaborations',
            'service_provider_profile_id',
            'agency_id',
        )->withPivot(['status', 'started_at', 'ended_at', 'metadata'])
            ->withTimestamps();
    }

    /**
     * TCK-260 — invitations émises pour ce profil draft. Mirror
     * OwnerProfile::invitations() pour exposer le statut d'invitation
     * (envoyée/expirée) côté UI sans round-trip supplémentaire.
     */
    public function invitations(): MorphMany
    {
        return $this->morphMany(Invitation::class, 'invitable');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', ServiceProviderProfileStatus::Active->value);
    }

    /**
     * TCK-260 — convenience : email cible du draft, lu depuis le metadata
     * tant qu'aucun User n'est attaché. À l'acceptation, l'invitation
     * crée le User et `user->email` devient l'unique source de vérité.
     */
    public function getDraftEmailAttribute(): ?string
    {
        if ($this->user !== null) {
            return $this->user->email;
        }

        return data_get($this->metadata, 'email');
    }

    /**
     * TCK-260 — convenience : nom complet à afficher pour un draft
     * (avant qu'un User ne soit créé) ou pour un profil actif.
     */
    public function getDisplayNameAttribute(): string
    {
        if ($this->user !== null) {
            return trim(($this->user->first_name ?? '').' '.($this->user->last_name ?? ''));
        }

        $first = (string) data_get($this->metadata, 'first_name', '');
        $last = (string) data_get($this->metadata, 'last_name', '');

        return trim($first.' '.$last);
    }
}
