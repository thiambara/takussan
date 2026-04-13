<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PropertyCollaborator extends AbstractModel
{
    use HasFactory;

    protected $table = 'property_collaborators';

    protected $fillable = [
        'property_id',
        'user_id',
        'role',
        'permissions',
        'notes',
        'invited_by',
        'invitation_accepted',
        'invitation_date',
        'accepted_date'
    ];

    protected $casts = [
        'permissions' => 'array',
        'invitation_accepted' => 'boolean',
        'invitation_date' => 'datetime',
        'accepted_date' => 'datetime',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }
}
