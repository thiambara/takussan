<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\ImpersonationEndReason;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * TCK-600 (ADR-0055) — une session d'impersonation : un opérateur `super_admin` lit l'application
 * en tant qu'un utilisateur, en lecture seule, 15 minutes au plus, pour un motif.
 *
 * Ouverte tant que `ended_at` est nul ET que `expires_at` n'est pas passé ; le jeton dédié
 * (`impersonation:read`) n'est valide que tant qu'elle l'est (`AccessTokenGate`).
 */
class ImpersonationSession extends AbstractModel
{
    use HasFactory;

    public const TTL_MINUTES = 15;

    protected $fillable = [
        'impersonator_id', 'target_user_id', 'personal_access_token_id', 'reason',
        'started_at', 'expires_at', 'ended_at', 'end_reason',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'expires_at' => 'datetime',
        'ended_at' => 'datetime',
        'end_reason' => ImpersonationEndReason::class,
    ];

    public function impersonator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'impersonator_id');
    }

    public function target(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    public function token(): BelongsTo
    {
        return $this->belongsTo(PersonalAccessToken::class, 'personal_access_token_id');
    }

    /** Ni fermée, ni échue. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('ended_at')->where('expires_at', '>', now());
    }

    public function isOpen(): bool
    {
        return $this->ended_at === null && $this->expires_at->isFuture();
    }
}
