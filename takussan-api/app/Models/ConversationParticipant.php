<?php

namespace App\Models;

use App\Models\Enums\ParticipantRole;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
        'role' => ParticipantRole::class,
        'last_read_at' => 'datetime',
        'is_muted' => 'boolean',
        'joined_at' => 'datetime',
        'left_at' => 'datetime',
        'archived_at' => 'datetime',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
