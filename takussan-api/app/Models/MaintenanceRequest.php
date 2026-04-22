<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class MaintenanceRequest extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia, SoftDeletes;

    protected $fillable = [
        'property_id', 'lease_id', 'requester_id', 'assigned_to',
        'title', 'description', 'category', 'priority', 'status',
        'estimated_cost', 'actual_cost',
        'scheduled_at', 'started_at', 'completed_at',
        'resolution_notes', 'resolution_report', 'metadata',
    ];

    protected $casts = [
        'category' => MaintenanceCategory::class,
        'priority' => MaintenancePriority::class,
        'status' => MaintenanceStatus::class,
        'estimated_cost' => 'decimal:2',
        'actual_cost' => 'decimal:2',
        'scheduled_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['property_id', 'lease_id', 'requester_id', 'assigned_to', 'category', 'priority', 'status'];

    protected static array $requestSortable = ['id', 'created_at', 'scheduled_at', 'priority', 'status'];

    protected static array $requestLoadable = ['property', 'lease', 'requester', 'assignee'];

    protected static array $requestSearchFields = ['title', 'description'];

    protected static array $queryFields = [
        'id', 'property_id', 'lease_id', 'requester_id', 'assigned_to',
        'title', 'category', 'priority', 'status',
        'estimated_cost', 'actual_cost', 'scheduled_at', 'completed_at',
        'created_at', 'updated_at',
    ];

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos');
        $this->addMediaCollection('completion_photos');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function conversation(): HasOne
    {
        return $this->hasOne(Conversation::class);
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }
}
