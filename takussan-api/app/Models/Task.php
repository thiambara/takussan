<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'title', 'description', 'taskable_id', 'taskable_type',
        'assigned_to_id', 'created_by_id', 'due_at', 'completed_at',
        'status', 'priority',
    ];

    protected $casts = [
        'status' => TaskStatus::class,
        'priority' => TaskPriority::class,
        'due_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function taskable(): MorphTo
    {
        return $this->morphTo();
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
