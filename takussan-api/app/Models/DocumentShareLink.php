<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentShareLink extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'document_id', 'token', 'token_hash', 'expires_at', 'password_hash',
        'max_downloads', 'downloads_count',
        'created_by_id', 'revoked_at', 'last_accessed_at',
    ];

    // TCK-602 (ADR-0051 §7) — l'empreinte ne sort jamais ; le jeton, chiffré en base, se relit par
    // qui gère le document (le format de l'API le choisit explicitement).
    protected $hidden = ['password_hash', 'token_hash'];

    protected $casts = [
        'token' => 'encrypted',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'last_accessed_at' => 'datetime',
    ];

    /**
     * TCK-602 — l'empreinte suit le jeton à chaque écriture : le service, la fabrique et le
     * générateur de données écrivent `token`, jamais `token_hash`.
     */
    protected static function booted(): void
    {
        static::saving(function (self $link): void {
            if ($link->isDirty('token')) {
                $link->token_hash = self::hashToken((string) $link->token);
            }
        });
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
