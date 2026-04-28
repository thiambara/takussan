<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\RoleDelegationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoleDelegation extends AbstractModel
{
    use Auditable, HasFactory;

    protected $fillable = [
        'user_id',
        'delegator_id',
        'agency_id',
        'role',
        'starts_at',
        'ends_at',
        'status',
        'reason',
        'user_native_roles_snapshot',
        'activated_at',
        'expired_at',
        'revoked_at',
        'revoked_by',
    ];

    protected $casts = [
        'status' => RoleDelegationStatus::class,
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'activated_at' => 'datetime',
        'expired_at' => 'datetime',
        'revoked_at' => 'datetime',
        'user_native_roles_snapshot' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function delegator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegator_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', RoleDelegationStatus::Active)
            ->where(function (Builder $q) {
                $q->whereNull('starts_at')
                    ->orWhere('starts_at', '<=', now());
            })
            ->where('ends_at', '>=', now());
    }

    public function scopeScheduled(Builder $query): Builder
    {
        return $query->where('status', RoleDelegationStatus::Scheduled);
    }

    public function scopeReadyToActivate(Builder $query): Builder
    {
        return $query->where('status', RoleDelegationStatus::Scheduled)
            ->where(function (Builder $q) {
                $q->whereNull('starts_at')
                    ->orWhere('starts_at', '<=', now());
            });
    }

    public function scopeReadyToExpire(Builder $query): Builder
    {
        return $query->where('status', RoleDelegationStatus::Active)
            ->where('ends_at', '<=', now());
    }

    public function scopeForAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }

    public function markActive(): void
    {
        $this->update([
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
        ]);
    }

    public function markExpired(): void
    {
        $this->update([
            'status' => RoleDelegationStatus::Expired,
            'expired_at' => now(),
        ]);
    }

    public function markRevoked(User $by): void
    {
        $this->update([
            'status' => RoleDelegationStatus::Revoked,
            'revoked_at' => now(),
            'revoked_by' => $by->id,
        ]);
    }
}
