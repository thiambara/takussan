<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Booking extends AbstractModel
{
    use HasFactory;

    protected $table = 'bookings';

    protected $fillable = [
        'propriety_id',
        'user_id',
        'status',
        'extra',
    ];

    public function propriety(): BelongsTo
    {
        return $this->belongsTo(Propriety::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
