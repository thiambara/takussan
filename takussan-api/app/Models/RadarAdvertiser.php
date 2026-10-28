<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarAdvertiserNature;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TCK-2386 (ADR-0077 §1, §7, §9) — l'annonceur d'une ou plusieurs annonces collectées, identifié par
 * son numéro. `phone` est purgé après un STOP ; `phone_hmac` reste (RadarPhone::hmac).
 *
 * TCK-2388 : la prise en charge de 10 minutes (`claimed_by_id`, `claimed_at`, `claim_expires_at`) vit sur la
 * ligne, écrite par `forceFill` dans `AdvertiserClaim` : hors de `$fillable`, hors de `$queryFields` (la
 * ressource rend un objet `claim` calculé).
 */
class RadarAdvertiser extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'phone', 'phone_hmac', 'display_name', 'nature', 'nature_signals', 'do_not_contact_at', 'user_id',
    ];

    protected $casts = [
        'nature' => RadarAdvertiserNature::class,
        'nature_signals' => 'array',
        'do_not_contact_at' => 'datetime',
        'claimed_at' => 'datetime',
        'claim_expires_at' => 'datetime',
    ];

    protected static array $queryFields = [
        'id', 'phone', 'display_name', 'nature', 'nature_signals', 'do_not_contact_at', 'user_id', 'created_at', 'updated_at',
    ];

    public function listings(): HasMany
    {
        return $this->hasMany(RadarListing::class, 'radar_advertiser_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function outreaches(): HasMany
    {
        return $this->hasMany(RadarOutreach::class, 'radar_advertiser_id');
    }

    public function consents(): HasMany
    {
        return $this->hasMany(RadarConsent::class, 'radar_advertiser_id');
    }

    /** L'opérateur qui tient la prise en charge. */
    public function claimer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'claimed_by_id');
    }
}
