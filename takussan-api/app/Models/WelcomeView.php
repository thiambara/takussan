<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-251 — Records that a given welcome modale (`key`) has been seen
 * by a user.
 *
 * Strictly user-scoped via the unique `(user_id, key)` index. The set
 * of valid keys lives in the frontend — the backend treats `key` as an
 * opaque short identifier (max 64 chars, alnum + `._:-`).
 */
class WelcomeView extends AbstractModel
{
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'key',
        'seen_at',
    ];

    protected $casts = [
        'seen_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
