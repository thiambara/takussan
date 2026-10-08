<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-596 §4B (ADR-0042 §3) — la preuve qu'une partie a consenti à un bail.
 *
 * Elle lie une EMPREINTE (`document_sha256`) : une signature ne compte que tant que cette empreinte
 * est celle du contrat figé du bail. `ip_address` et `user_agent` sont des pièces de preuve, cachées
 * de toute sérialisation.
 */
class LeaseSignature extends AbstractModel
{
    public const ROLE_TENANT = 'tenant';

    public const ROLE_LANDLORD = 'landlord';

    public const ROLES = [self::ROLE_TENANT, self::ROLE_LANDLORD];

    public const METHOD_OTP = 'otp';

    public const METHOD_PAPER = 'paper';

    protected $fillable = [
        'lease_id', 'role', 'method', 'user_id', 'on_behalf_of_user_id', 'recorded_by_id',
        'document_sha256', 'signed_at', 'ip_address', 'user_agent', 'otp_channel', 'otp_destination',
    ];

    protected $hidden = ['ip_address', 'user_agent'];

    protected $casts = [
        'signed_at' => 'datetime',
    ];

    protected static array $queryFields = [
        'id', 'lease_id', 'role', 'method', 'user_id', 'on_behalf_of_user_id', 'document_sha256', 'signed_at',
    ];

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function signer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function onBehalfOf(): BelongsTo
    {
        return $this->belongsTo(User::class, 'on_behalf_of_user_id');
    }
}
