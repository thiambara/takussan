<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Notification extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $table = 'notifications';

    protected $fillable = [
        'user_id',
        'type',
        'title',
        'content',
        'reference_id',
        'reference_type',
        'is_read',
        'read_at',
        'is_actioned',
        'actioned_at',
        'delivered',
        'delivery_channel',
        'delivered_at'
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'read_at' => 'datetime',
        'is_actioned' => 'boolean',
        'actioned_at' => 'datetime',
        'delivered' => 'boolean',
        'delivered_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
