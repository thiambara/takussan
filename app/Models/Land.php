<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Land extends AbstractModel
{
    use HasFactory;
    protected $fillable = [
        'title',
        'description',
        'status',
        'price',
        'area',
        'project_id',
        'extra',
    ];


    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

}
