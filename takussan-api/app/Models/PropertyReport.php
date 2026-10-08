<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PropertyReport extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'property_id',
        'reporter_user_id',
        'reporter_ip',
        'reporter_fingerprint',
        'reason',
        'details',
        'resolved_at',
        'decision',
        'resolved_by_id',
        'reason_code',
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

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_id');
    }

    /** @param Builder<PropertyReport> $query */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('resolved_at');
    }
}
