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

    protected $fillable = [
        'reviewable_id', 'reviewable_type', 'author_id',
        'rating', 'title', 'content',
        'is_approved', 'approved_at',
        'reply_content', 'replied_by_id', 'replied_at', 'metadata',
    ];

    protected $casts = [
        'rating' => 'integer',
        'is_approved' => 'boolean',
        'approved_at' => 'datetime',
        'replied_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function reviewable(): MorphTo
    {
        return $this->morphTo();
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function repliedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'replied_by_id');
    }
}
