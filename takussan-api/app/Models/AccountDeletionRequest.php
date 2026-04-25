<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-080 — pending RGPD deletion request.
 *
 * Lives between `requestDeletion()` (creates the row, schedules
 * `requested_at + ACCOUNT_DELETION_GRACE_DAYS`) and `executeDeletion()`
 * (sets `executed_at`, kicks off anonymization). On cancellation the row
 * is deleted outright — only one pending request per user (enforced by
 * the UNIQUE on `user_id`).
 */
class AccountDeletionRequest extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'requested_at',
        'scheduled_for',
        'reason',
        'reason_code',
        'executed_at',
        'reminder_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'scheduled_for' => 'datetime',
            'executed_at' => 'datetime',
            'reminder_sent_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isPending(): bool
    {
        return $this->executed_at === null;
    }

    public function daysRemaining(): int
    {
        if (! $this->scheduled_for) {
            return 0;
        }

        return max(0, (int) ceil(now()->floatDiffInDays($this->scheduled_for, false)));
    }
}
