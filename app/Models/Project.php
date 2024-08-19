<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'status',
        'user_id',
        'extra',
    ];

    public function lands() : HasMany
    {
        return $this->hasMany(Land::class);
    }

    public function user() : BelongsTo
    {
        return $this->belongsTo(User::class);
    }

}
