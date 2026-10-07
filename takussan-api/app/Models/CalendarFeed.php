<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-591 (ADR-0034) — un lien d'abonnement d'agenda. Le jeton n'est connu que par son empreinte :
 * {@see self::hashToken()} est la seule façon de passer de l'un à l'autre.
 */
class CalendarFeed extends AbstractModel
{
    protected $fillable = ['user_id', 'agency_id', 'token_hash', 'revoked_at', 'last_accessed_at'];

    protected $hidden = ['token_hash'];

    protected $casts = [
        'revoked_at' => 'datetime',
        'last_accessed_at' => 'datetime',
    ];

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('revoked_at');
    }
}
