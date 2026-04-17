<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppNotification extends AbstractModel
{
    use HasFactory;

    protected $table = 'app_notifications';

    protected $fillable = [
        'user_id', 'type', 'delivery_channel',
        'title', 'body', 'data',
        'referenceable_id', 'referenceable_type',
        'is_read', 'read_at', 'sent_at',
    ];

    protected $casts = [
        'type' => NotificationType::class,
        'delivery_channel' => NotificationChannel::class,
        'data' => 'array',
        'is_read' => 'boolean',
        'read_at' => 'datetime',
        'sent_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reference()
    {
        $map = [
            'booking' => Booking::class,
            'lease' => Lease::class,
            'lease_payment' => LeasePayment::class,
            'maintenance' => MaintenanceRequest::class,
        ];
        $class = $map[$this->referenceable_type] ?? null;

        return $class ? $class::find($this->referenceable_id) : null;
    }
}
