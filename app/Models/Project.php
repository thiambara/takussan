<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends AbstractModel
{
    use HasFactory;

    protected $table = 'projects';

    protected $casts = [
        'servicing' => 'array',
    ];

    protected $fillable = [
        'title',
        'description',
        'status',
        'user_id',
        'title_type',
        'with_administrative_monitoring',
        'visibility',
        'servicing',
        'extra',
    ];

    public function proprieties(): HasMany
    {
        return $this->hasMany(Propriety::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

}
