<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $table = 'customers';

    protected $fillable = [
        'first_name',
        'last_name',
        'email',
        'phone',
        'status',
        'added_by_id',
        'extra',
    ];

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function added_by(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by_id');
    }
}
