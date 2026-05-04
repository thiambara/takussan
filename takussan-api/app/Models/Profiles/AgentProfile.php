<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\AgentProfileStatus;
use App\Models\User;
use Database\Factories\Profiles\AgentProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class AgentProfile extends AbstractModel
{
    /** @use HasFactory<AgentProfileFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'agency_id', 'status',
        'license_number', 'commission_rate',
        'specialty', 'hire_date', 'active_until',
        'metadata',
    ];

    protected $casts = [
        'status' => AgentProfileStatus::class,
        'commission_rate' => 'decimal:2',
        'hire_date' => 'date',
        'active_until' => 'date',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', AgentProfileStatus::Active->value);
    }

    public function scopeWithinAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }
}
