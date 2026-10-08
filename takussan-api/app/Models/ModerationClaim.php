<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-597 (ADR-0043 §7) — la prise en charge d'un élément de la file de modération, 10 minutes.
 */
class ModerationClaim extends AbstractModel
{
    public const DURATION_MINUTES = 10;

    protected $fillable = ['item_key', 'claimed_by_id', 'claimed_at', 'expires_at'];

    protected $casts = [
        'claimed_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function claimedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'claimed_by_id');
    }

    public function isActive(): bool
    {
        return $this->expires_at->isFuture();
    }
}
