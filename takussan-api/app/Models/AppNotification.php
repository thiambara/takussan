<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AppNotification extends AbstractModel
{
    use HasFactory;

    protected $table = 'app_notifications';

    protected $fillable = [
        'user_id', 'type', 'delivery_channel',
        'code', 'params', 'target',
        // TCK-1020 (P58.05) — `delivery_attempts` n'y est plus : la colonne JSON n'a plus
        // d'écrivain depuis TCK-110 (`notification_delivery_attempts` la remplace). Son retrait
        // attend une mesure de la préproduction.
        'title', 'body', 'data',
        'referenceable_id', 'referenceable_type',
        'is_read', 'read_at', 'sent_at', 'digested_at',
    ];

    protected $casts = [
        'type' => NotificationType::class,
        'delivery_channel' => NotificationChannel::class,
        'data' => 'array',
        // TCK-588 (ADR-0032) — paramètres bruts et cible d'une notification par code.
        'params' => 'array',
        'target' => 'array',
        // TCK-102 — JSON array of fallback-chain attempts.
        'delivery_attempts' => 'array',
        'is_read' => 'boolean',
        'read_at' => 'datetime',
        'sent_at' => 'datetime',
        'digested_at' => 'datetime',
    ];

    /**
     * Notifications marked is_critical in data bypass digest and are
     * always sent immediately regardless of email_frequency.
     */
    public function isCritical(): bool
    {
        return (bool) (($this->data ?? [])['is_critical'] ?? false);
    }

    public function scopeUndigested(Builder $query): Builder
    {
        return $query->whereNull('digested_at');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * TCK-110 — Normalised delivery attempts. Replaces the JSON
     * `delivery_attempts` column for fast `(provider, message_id)`
     * webhook lookups.
     */
    public function deliveryAttempts(): HasMany
    {
        return $this->hasMany(NotificationDeliveryAttempt::class)->orderBy('attempt');
    }
}
