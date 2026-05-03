<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\User;
use Database\Factories\Profiles\ServiceProviderProfileFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ServiceProviderProfile extends AbstractModel
{
    /** @use HasFactory<ServiceProviderProfileFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'specialties', 'service_areas',
        'insurance_policy_id', 'certifications',
        'hourly_rate_min', 'hourly_rate_max',
        'active_until', 'metadata',
    ];

    protected $casts = [
        'specialties' => 'array',
        'service_areas' => 'array',
        'certifications' => 'array',
        'hourly_rate_min' => 'decimal:2',
        'hourly_rate_max' => 'decimal:2',
        'active_until' => 'date',
        'metadata' => 'array',
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
}
