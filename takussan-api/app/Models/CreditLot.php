<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\CreditLotOrigin;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TCK-633 lot F (ADR-0061 §1) — un lot daté de crédits d'un espace. Écrit par
 * `App\Services\Credits\CreditLedger` SEUL : `remaining_amount` n'a de sens qu'adossé aux
 * mouvements qui l'expliquent.
 */
class CreditLot extends AbstractModel
{
    protected $fillable = [
        'agency_id', 'origin', 'initial_amount', 'remaining_amount', 'expires_at',
        'granted_by_id', 'reason', 'expiry_notice_sent_at',
    ];

    protected $casts = [
        'origin' => CreditLotOrigin::class,
        'initial_amount' => 'integer',
        'remaining_amount' => 'integer',
        'expires_at' => 'datetime',
        'expiry_notice_sent_at' => 'datetime',
    ];

    /** Un lot dont il reste quelque chose et qui n'a pas expiré. */
    public function scopeSpendable(Builder $query): Builder
    {
        return $query->where('remaining_amount', '>', 0)
            ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    /** ADR-0061 §2 : expiration la plus proche d'abord, sans expiration en dernier, puis ancienneté. */
    public function scopeInConsumptionOrder(Builder $query): Builder
    {
        return $query->orderByRaw('expires_at ASC NULLS LAST')->orderBy('created_at')->orderBy('id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by_id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(CreditMovement::class);
    }
}
