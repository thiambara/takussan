<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\AnnouncementSeverity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Announcement extends AbstractModel
{
    use Auditable;

    protected $fillable = [
        'title',
        'body',
        'severity',
        'segment',
        'starts_at',
        'ends_at',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'title' => 'array',
        'body' => 'array',
        'severity' => AnnouncementSeverity::class,
        'segment' => 'array',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'is_active' => 'boolean',
    ];

    protected static array $requestFilterable = ['is_active', 'severity'];

    protected static array $requestSortable = ['id', 'starts_at', 'ends_at', 'created_at', 'updated_at'];

    protected static array $requestLoadable = ['creator'];

    protected static array $queryFields = [
        'id',
        'title',
        'body',
        'severity',
        'segment',
        'starts_at',
        'ends_at',
        'is_active',
        'created_by',
        'created_at',
        'updated_at',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function dismissals(): HasMany
    {
        return $this->hasMany(AnnouncementDismissal::class);
    }

    public function scopeCurrentlyVisible(Builder $query): Builder
    {
        return $query
            ->where('is_active', true)
            ->where('starts_at', '<=', now())
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()));
    }
}
