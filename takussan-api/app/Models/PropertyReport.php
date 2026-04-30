<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PropertyReport extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'property_id',
        'reporter_user_id',
        'reporter_ip',
        'reason',
        'details',
        'resolved_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_user_id');
    }
}
