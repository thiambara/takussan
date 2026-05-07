<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\AgencySubscriptionStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AgencySubscription extends AbstractModel
{
    use Auditable, HasFactory;

    protected $fillable = [
        'agency_id',
        'plan_id',
        'status',
        'trial_ends_at',
        'current_period_start',
        'current_period_end',
        'ended_at',
        'platform_fee_pct_override',
        'limits_override',
    ];

    protected $casts = [
        'status' => AgencySubscriptionStatus::class,
        'trial_ends_at' => 'datetime',
        'current_period_start' => 'datetime',
        'current_period_end' => 'datetime',
        'ended_at' => 'datetime',
        'platform_fee_pct_override' => 'decimal:2',
        'limits_override' => 'array',
    ];

    protected static array $requestFilterable = ['agency_id', 'plan_id', 'status'];

    protected static array $requestSortable = ['created_at', 'current_period_end', 'trial_ends_at'];

    protected static array $requestLoadable = ['agency', 'plan'];

    protected static array $queryFields = [
        'id',
        'agency_id',
        'plan_id',
        'status',
        'trial_ends_at',
        'current_period_start',
        'current_period_end',
        'ended_at',
        'platform_fee_pct_override',
        'limits_override',
        'created_at',
        'updated_at',
    ];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function scopeCurrent(Builder $query): Builder
    {
        return $query->whereNull('ended_at');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query
            ->whereNull('ended_at')
            ->whereIn('status', [AgencySubscriptionStatus::Trialing, AgencySubscriptionStatus::Active]);
    }
}
