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
        'title', 'body', 'data', 'delivery_attempts',
        'referenceable_id', 'referenceable_type',
        'is_read', 'read_at', 'sent_at', 'digested_at',
    ];

    protected $casts = [
        'type' => NotificationType::class,
        'delivery_channel' => NotificationChannel::class,
        'data' => 'array',
        // TCK-102 — JSON array of fallback-chain attempts.
        'delivery_attempts' => 'array',
        'is_read' => 'boolean',
        'read_at' => 'datetime',
        'sent_at' => 'datetime',
        'digested_at' => 'datetime',
    ];

    /**
     * Notifications marked is_critical in metadata bypass digest and are
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

    public function reference()
    {
        $map = [
            'booking' => Booking::class,
            'lease' => Lease::class,
            'lease_payment' => LeasePayment::class,
            'maintenance' => MaintenanceRequest::class,
            'property_visit' => PropertyVisit::class,
        ];
        $class = $map[$this->referenceable_type] ?? null;

        return $class ? $class::find($this->referenceable_id) : null;
    }
}
