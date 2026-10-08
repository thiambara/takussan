<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SavedSearch extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'alert_subscriber_id', 'name', 'criteria', 'notification_frequency',
        'is_active', 'last_notified_at', 'results_count', 'metadata',
    ];

    protected $casts = [
        'criteria' => 'array',
        'is_active' => 'boolean',
        'last_notified_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** TCK-599 — le propriétaire sans compte ; exactement un des deux est renseigné (CHECK en base). */
    public function alertSubscriber(): BelongsTo
    {
        return $this->belongsTo(AlertSubscriber::class);
    }

    /** Le destinataire de l'alerte : le compte, ou l'abonné sans compte. */
    public function recipient(): User|AlertSubscriber|null
    {
        return $this->user ?? $this->alertSubscriber;
    }
}
