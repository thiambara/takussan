<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeatureFlag extends AbstractModel
{
    protected $fillable = ['key', 'label', 'description', 'enabled', 'segments_json', 'updated_by_id'];

    protected $casts = [
        'enabled' => 'boolean',
        'segments_json' => 'array',
    ];

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_id');
    }
}
