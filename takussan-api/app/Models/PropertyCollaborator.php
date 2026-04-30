<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\CollaboratorRole;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PropertyCollaborator extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'property_id', 'user_id', 'role',
        'commission_share', 'invited_at', 'accepted_at', 'metadata',
    ];

    protected $casts = [
        'role' => CollaboratorRole::class,
        'commission_share' => 'decimal:2',
        'invited_at' => 'datetime',
        'accepted_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
