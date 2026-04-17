<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Conversation extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'subject', 'property_id', 'lease_id', 'maintenance_request_id',
        'type', 'status', 'created_by',
        'last_message_id', 'last_message_preview', 'last_message_at', 'metadata',
    ];

    protected $casts = [
        'type' => ConversationType::class,
        'status' => ConversationStatus::class,
        'last_message_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function maintenanceRequest(): BelongsTo
    {
        return $this->belongsTo(MaintenanceRequest::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function lastMessage(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'last_message_id');
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'conversation_participants')
            ->using(ConversationParticipant::class)
            ->withPivot(['role', 'last_read_at', 'is_muted', 'joined_at', 'left_at'])
            ->withTimestamps();
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }
}
