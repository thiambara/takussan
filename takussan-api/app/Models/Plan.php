<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends AbstractModel
{
    use Auditable, HasFactory;

    protected $fillable = [
        'code',
        'label',
        'description',
        'monthly_price_xof',
        'platform_fee_pct',
        'trial_days',
        'limits',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'monthly_price_xof' => 'decimal:2',
        'platform_fee_pct' => 'decimal:2',
        'trial_days' => 'integer',
        'limits' => 'array',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    protected static array $requestFilterable = ['code', 'is_active'];

    protected static array $requestSortable = ['sort_order', 'monthly_price_xof', 'created_at'];

    protected static array $requestLoadable = ['subscriptions'];

    protected static array $queryFields = [
        'id',
        'code',
        'label',
        'description',
        'monthly_price_xof',
        'platform_fee_pct',
        'trial_days',
        'limits',
        'is_active',
        'sort_order',
        'created_at',
        'updated_at',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(AgencySubscription::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
