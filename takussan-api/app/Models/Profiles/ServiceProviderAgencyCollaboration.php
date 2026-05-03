<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\CollaborationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ServiceProviderAgencyCollaboration extends AbstractModel
{
    use SoftDeletes;

    protected $fillable = [
        'service_provider_profile_id', 'agency_id', 'status',
        'started_at', 'ended_at', 'metadata',
    ];

    protected $casts = [
        'status' => CollaborationStatus::class,
        'started_at' => 'date',
        'ended_at' => 'date',
        'metadata' => 'array',
    ];

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
