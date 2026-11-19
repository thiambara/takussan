<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Pont\LiensDAction;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2982 (ADR-0132 § 5) — un lien d'action signé : un geste, sur un objet, pour un compte, une fois.
 *
 * Seule l'empreinte du jeton est en base ({@see LiensDAction::empreinte()}). Le modèle n'est PAS
 * journalisé (`Auditable`) : rien de ce qui touche au jeton n'entre dans `activity_log`.
 */
class ActionLink extends AbstractModel
{
    use HasFactory;

    /** L'état d'un lien, tel que la page le lit. */
    public const ETAT_OUVERT = 'open';

    public const ETAT_FAIT = 'done';

    public const ETAT_EXPIRE = 'expired';

    public const ETAT_UTILISE = 'used';

    public const ETAT_REVOQUE = 'revoked';

    protected $fillable = [
        'token_hash', 'gesture', 'subject_type', 'subject_id', 'user_id', 'phone', 'message_id',
        'message_relay_id', 'expires_at', 'opened_at', 'used_at', 'revoked_at',
    ];

    /** L'empreinte et le numéro ne sortent jamais d'un `toArray()`. */
    protected $hidden = ['token_hash', 'phone'];

    protected function casts(): array
    {
        return [
            'subject_id' => 'integer',
            'expires_at' => 'datetime',
            'opened_at' => 'datetime',
            'used_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /** `null` pour un lien vivant ; sinon `used`, `revoked` ou `expired` (dans cet ordre). */
    public function mort(): ?string
    {
        return match (true) {
            $this->used_at !== null => self::ETAT_UTILISE,
            $this->revoked_at !== null => self::ETAT_REVOQUE,
            $this->expires_at === null || ! $this->expires_at->isFuture() => self::ETAT_EXPIRE,
            default => null,
        };
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }
}
