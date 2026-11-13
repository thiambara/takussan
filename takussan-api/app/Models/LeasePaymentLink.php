<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PaymentLinkSubject;
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
        // TCK-2778 — ce que le lien fait payer : le loyer, ou la pénalité seule. Déduit de l'échéance
        // à l'émission (`LeasePaymentLinkService::subjectFor`), jamais reçu d'un client.
        'subject',
    ];

    protected $hidden = ['token', 'token_hash'];

    protected $casts = [
        'token' => 'encrypted',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'last_accessed_at' => 'datetime',
        'access_count' => 'integer',
        'subject' => PaymentLinkSubject::class,
    ];

    /** Jamais `token` ni `token_hash`. */
    protected static array $queryFields = [
        'id', 'lease_payment_id', 'expires_at', 'revoked_at', 'last_accessed_at', 'access_count',
        'created_by_id', 'subject', 'created_at', 'updated_at',
    ];

    /** TCK-2778 — le lien fait-il payer la pénalité de retard seule ? (`null`, avant la migration : le loyer.) */
    public function isForLateFee(): bool
    {
        return $this->subject === PaymentLinkSubject::LateFee;
    }

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
