<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Booking extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'land_id',
        'user_id',
        'status',
        'extra',
    ];

    public function land(): BelongsTo
    {
        return $this->belongsTo(Land::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
