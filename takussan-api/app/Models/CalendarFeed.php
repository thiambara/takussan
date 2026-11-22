<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-591 (ADR-0034) — un lien d'abonnement d'agenda. Le jeton se VÉRIFIE par son empreinte :
 * {@see self::hashToken()} est la seule façon de résoudre un flux.
 *
 * TCK-2887 (ADR-0121) — une copie chiffrée (`token_encrypted`, clé de l'application) ne sert qu'à
 * RENDRE le lien à son titulaire ({@see self::readableToken()}) ; toute révocation l'efface.
 */
class CalendarFeed extends AbstractModel
{
    protected $fillable = ['user_id', 'agency_id', 'token_hash', 'token_encrypted', 'revoked_at', 'last_accessed_at'];

    // TCK-2887 — la copie chiffrée ne sort jamais avec le modèle.
    protected $hidden = ['token_hash', 'token_encrypted'];

    protected $casts = [
        // TCK-2887 (ADR-0121) — chiffrée sous `APP_KEY` ; `APP_PREVIOUS_KEYS` couvre une rotation.
        'token_encrypted' => 'encrypted',
        'revoked_at' => 'datetime',
        'last_accessed_at' => 'datetime',
    ];

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * TCK-2887 (ADR-0121) — le jeton en clair, pour son titulaire seul ; `null` pour un lien antérieur
     * (sans copie) ou une copie indéchiffrable (clé perdue, valeur altérée) — jamais une erreur.
     */
    public function readableToken(): ?string
    {
        try {
            $token = $this->token_encrypted;
        } catch (DecryptException) {
            return null;
        }

        return is_string($token) && $token !== '' ? $token : null;
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
