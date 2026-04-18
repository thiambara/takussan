<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Integration extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'provider', 'agency_id', 'credentials', 'is_active',
        'last_used_at', 'metadata',
    ];

    protected $hidden = ['credentials'];

    protected $casts = [
        'credentials' => 'encrypted:array',
        'is_active' => 'boolean',
        'last_used_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['agency_id', 'provider', 'is_active'];

    protected static array $requestSortable = ['id', 'created_at', 'provider'];

    protected static array $queryFields = ['id', 'agency_id', 'provider', 'is_active', 'last_used_at', 'created_at', 'updated_at'];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }
}
