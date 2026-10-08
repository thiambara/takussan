<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Payments\LeasePaymentLinkService;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-602 (ADR-0051 §1) — le lien porteur d'une échéance. `token` (clair chiffré) et
 * `token_hash` ne sortent par aucune sérialisation : seul {@see LeasePaymentLinkService}
 * les lit, pour chercher ou pour rendre l'URL. Pas de `LogsActivity` : un journal d'activité
 * garderait l'empreinte, et il n'a rien à en dire.
 */
class LeasePaymentLink extends AbstractModel
{
    protected $fillable = [
        'lease_payment_id', 'token_hash', 'token', 'expires_at', 'revoked_at',
        'last_accessed_at', 'access_count', 'created_by_id',
    ];

    protected $hidden = ['token', 'token_hash'];

    protected $casts = [
        'token' => 'encrypted',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'last_accessed_at' => 'datetime',
        'access_count' => 'integer',
    ];

    /** Jamais `token` ni `token_hash`. */
    protected static array $queryFields = [
        'id', 'lease_payment_id', 'expires_at', 'revoked_at', 'last_accessed_at', 'access_count',
        'created_by_id', 'created_at', 'updated_at',
    ];

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function leasePayment(): BelongsTo
    {
        return $this->belongsTo(LeasePayment::class)->withTrashed();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
