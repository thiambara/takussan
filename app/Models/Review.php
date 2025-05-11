<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Review extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $table = 'reviews';

    protected $fillable = [
        'model_id',
        'model_type',
        'user_id',
        'rating',
        'title',
        'content',
        'is_approved',
        'approved_by',
        'approved_at',
        'reported_count'
    ];

    protected $casts = [
        'rating' => 'decimal:1',
        'is_approved' => 'boolean',
        'approved_at' => 'datetime',
        'reported_count' => 'integer',
    ];

    public function model(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
