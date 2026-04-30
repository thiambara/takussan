<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SavedSearch extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'name', 'criteria', 'notification_frequency',
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
}
