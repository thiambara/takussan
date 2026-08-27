<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PropertyContactLead extends AbstractModel
{
    protected $fillable = [
        'property_id',
        'agency_id',
        'recipient_user_id',
        'name',
        'email',
        'phone',
        'message',
        'ip',
        'user_agent',
        'handled_at',
    ];

    protected $casts = [
        'handled_at' => 'datetime',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_user_id');
    }
}
