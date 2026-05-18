<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-250 — Resumable wizard draft.
 *
 * Generic JSON-bag persistence for multi-step onboarding flows. Always
 * scoped per `(user_id, key)`. The `data` shape is owned by the consumer
 * wizard, not by this model.
 */
class WizardDraft extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'key',
        'step',
        'data',
    ];

    protected $casts = [
        'step' => 'integer',
        'data' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
