<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Concerns\HasAgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\CollaborationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * TCK-315 (ADR-0015) — **c'est cette ligne, et non le profil, qui porte le
 * rôle d'agence d'un prestataire.**
 *
 * `ServiceProviderProfile` est user-scopé (`user_id` UNIQUE, aucune colonne
 * `agency_id`) : un prestataire a un profil global et sert N agences. La
 * collaboration porte exactement le couple *(profil, agence)* — c'est la
 * granularité que le principe non négociable n°2 exige. Un prestataire a
 * donc **un rôle par agence**, et la Règle 6 se lit ici « 1 collaboration
 * = 1 rôle ».
 */
class ServiceProviderAgencyCollaboration extends AbstractModel
{
    use HasAgencyRole;
    use SoftDeletes;

    protected $fillable = [
        'service_provider_profile_id', 'agency_id', 'status',
        'started_at', 'ended_at', 'metadata', 'agency_role_id',
    ];

    protected $casts = [
        'status' => CollaborationStatus::class,
        'started_at' => 'date',
        'ended_at' => 'date',
        'metadata' => 'array',
    ];

    /**
     * spatie/laravel-query-builder hooks. TCK-262 expose ce modèle via
     * `GET /api/me/service-provider/agencies` (listing cross-agences pour
     * un SP donné). Sparse fieldsets / includes / filters côté front.
     */
    protected static array $requestFilterable = ['status', 'agency_id', 'service_provider_profile_id', 'agency_role_id'];

    protected static array $requestSortable = ['id', 'created_at', 'started_at', 'status'];

    protected static array $requestLoadable = ['agency', 'serviceProviderProfile', 'agencyRole'];

    protected static array $queryFields = [
        'id', 'service_provider_profile_id', 'agency_id', 'status',
        'started_at', 'ended_at', 'metadata', 'agency_role_id',
        'created_at', 'updated_at',
    ];

    /**
     * `HasAgencyRole` dérive normalement ce type de
     * `AgencyRoleBaseType::profileClass()`. Cette table de correspondance ne
     * connaît que les trois PROFILS agence-scopés — `ServiceProvider` y rend
     * `null`, et c'est juste : son porteur n'est pas un profil. On le déclare
     * donc ici, à l'unique endroit qui le sait.
     */
    public static function agencyRoleBaseType(): AgencyRoleBaseType
    {
        return AgencyRoleBaseType::ServiceProvider;
    }

    public function serviceProviderProfile(): BelongsTo
    {
        return $this->belongsTo(ServiceProviderProfile::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', CollaborationStatus::Active->value);
    }
}
