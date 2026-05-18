<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\PlatformPayoutStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlatformPayout extends AbstractModel
{
    use Auditable, HasFactory;

    protected $fillable = [
        'agency_id',
        'period_start',
        'period_end',
        'gross_amount',
        'platform_fee_amount',
        'net_amount',
        'currency',
        'status',
        'approved_by',
        'processed_at',
        'failure_reason',
        'metadata',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'gross_amount' => 'decimal:2',
        'platform_fee_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'status' => PlatformPayoutStatus::class,
        'processed_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['agency_id', 'status', 'currency'];

    protected static array $requestRangeFilters = ['period_end', 'period_start'];

    protected static array $requestSortable = ['period_end', 'period_start', 'created_at', 'net_amount'];

    protected static array $requestLoadable = ['agency', 'approver'];

    protected static array $queryFields = [
        'id',
        'agency_id',
        'period_start',
        'period_end',
        'gross_amount',
        'platform_fee_amount',
        'net_amount',
        'currency',
        'status',
        'approved_by',
        'processed_at',
        'failure_reason',
        'metadata',
        'created_at',
        'updated_at',
    ];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function bookingPayments(): HasMany
    {
        return $this->hasMany(BookingPayment::class);
    }

    public function leasePayments(): HasMany
    {
        return $this->hasMany(LeasePayment::class);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', PlatformPayoutStatus::Pending);
    }

    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('status', PlatformPayoutStatus::Approved);
    }

    public function scopePaid(Builder $query): Builder
    {
        return $query->where('status', PlatformPayoutStatus::Paid);
    }
}
