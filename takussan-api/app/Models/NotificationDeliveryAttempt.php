<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-110 — One row per SMS delivery attempt. Replaces the JSON
 * `app_notifications.delivery_attempts` column with a normalised
 * table indexed on `(provider, provider_message_id)` so DLR webhook
 * lookups are O(1).
 */
class NotificationDeliveryAttempt extends AbstractModel
{
    protected $table = 'notification_delivery_attempts';

    protected $fillable = [
        'app_notification_id',
        'attempt',
        'provider',
        'provider_message_id',
        'to',
        'status',
        'failure_reason',
        'cost_estimate',
        'segments_count',
        'sent_at',
        'delivered_at',
    ];

    protected $casts = [
        'attempt' => 'integer',
        'segments_count' => 'integer',
        'cost_estimate' => 'float',
        'sent_at' => 'datetime',
        'delivered_at' => 'datetime',
    ];

    public function appNotification(): BelongsTo
    {
        return $this->belongsTo(AppNotification::class);
    }
}
