<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-282 — WhatsApp contact: consent + 24h service-window anchor
 * (`last_inbound_at`). Shared foundation for outbound (this ticket) and
 * future inbound mise-en-relation. See models-spec §54.
 */
class WhatsappContact extends AbstractModel
{
    public const OPT_IN_PENDING = 'pending';

    public const OPT_IN_OPTED_IN = 'opted_in';

    public const OPT_IN_OPTED_OUT = 'opted_out';

    protected $table = 'whatsapp_contacts';

    protected $fillable = [
        'phone',
        'user_id',
        'display_name',
        'opt_in_status',
        'opt_in_source',
        'opt_in_at',
        'last_inbound_at',
        'opted_out_at',
    ];

    protected $casts = [
        'opt_in_at' => 'datetime',
        'last_inbound_at' => 'datetime',
        'opted_out_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isOptedOut(): bool
    {
        return $this->opt_in_status === self::OPT_IN_OPTED_OUT;
    }

    /**
     * TCK-283 — Outbound opt-out toggle. Honored by the WhatsApp channel
     * (an opted-out contact is never sent to; the send falls back to SMS).
     */
    public function optOut(?string $source = null): self
    {
        $this->forceFill([
            'opt_in_status' => self::OPT_IN_OPTED_OUT,
            'opt_in_source' => $source ?? $this->opt_in_source,
            'opted_out_at' => now(),
        ])->save();

        return $this;
    }

    public function optIn(?string $source = null): self
    {
        $this->forceFill([
            'opt_in_status' => self::OPT_IN_OPTED_IN,
            'opt_in_source' => $source ?? $this->opt_in_source,
            'opt_in_at' => now(),
            'opted_out_at' => null,
        ])->save();

        return $this;
    }

    /**
     * Contacts whose last inbound message is within the Meta service window
     * (default 24h) — free-form text is allowed for these.
     */
    public function scopeWithinServiceWindow(Builder $query, int $hours = 24): Builder
    {
        return $query->where('last_inbound_at', '>=', now()->subHours($hours));
    }

    public function scopeOptedIn(Builder $query): Builder
    {
        return $query->where('opt_in_status', self::OPT_IN_OPTED_IN);
    }
}
