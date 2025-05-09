<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Booking extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $table = 'bookings';

    protected $fillable = [
        'propriety_id',
        'customer_id',
        'status',
        'extra'
    ];

    public function propriety(): BelongsTo
    {
        return $this->belongsTo(Propriety::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
