<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-110 — One row per SMS/WhatsApp delivery attempt. Replaces the JSON
 * `app_notifications.delivery_attempts` column with a normalised
 * table indexed on `(provider, provider_message_id)` so DLR webhook
 * lookups are O(1).
 *
 * TCK-2326 (P203.05) — `agency_id` : l'agence de l'envoi, dont le canal a cherché l'intégration ;
 * `integration_id` : l'intégration que le fournisseur a prise (celle de l'agence, ou de la
 * plateforme). Nuls quand aucun fournisseur n'a été appelé, et sur les lignes d'avant.
 */
class NotificationDeliveryAttempt extends AbstractModel
{
    protected $table = 'notification_delivery_attempts';

    protected $fillable = [
        'app_notification_id',
        'agency_id',
        'integration_id',
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
        'agency_id' => 'integer',
        'integration_id' => 'integer',
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

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function integration(): BelongsTo
    {
        return $this->belongsTo(Integration::class);
    }
}
