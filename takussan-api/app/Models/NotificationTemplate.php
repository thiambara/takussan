<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationTemplate extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['event', 'channel', 'locale', 'subject', 'body', 'is_active', 'updated_by_id'];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_id');
    }
}
