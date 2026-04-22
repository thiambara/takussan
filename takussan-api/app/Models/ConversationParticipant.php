<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\Pivot;

class ConversationParticipant extends Pivot
{
    use HasFactory;

    protected $table = 'conversation_participants';

    public $incrementing = true;

    protected $fillable = [
        'conversation_id', 'user_id', 'role',
        'last_read_at', 'is_muted', 'joined_at', 'left_at', 'archived_at',
    ];

    protected $casts = [
        'last_read_at' => 'datetime',
        'is_muted' => 'boolean',
        'joined_at' => 'datetime',
        'left_at' => 'datetime',
        'archived_at' => 'datetime',
    ];
}
