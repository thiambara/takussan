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
}
