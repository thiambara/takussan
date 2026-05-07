<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AnnouncementDismissal extends AbstractModel
{
    protected $fillable = ['announcement_id', 'user_id', 'dismissed_at'];

    protected $casts = [
        'dismissed_at' => 'datetime',
    ];

    public function announcement(): BelongsTo
    {
        return $this->belongsTo(Announcement::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
