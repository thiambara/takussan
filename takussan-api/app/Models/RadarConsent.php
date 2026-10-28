<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarVerificationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

/**
 * TCK-2388 (ADR-0077 §3) — une réponse d'annonceur déposée sur un message : sa preuve, le verdict de l'IA
 * (qui n'ouvre rien) et la confirmation humaine, qui seule rend l'accord valide. Les captures vivent dans la
 * collection `radar_consent_captures`, sur le disque PRIVÉ par défaut (ADR-0029), comme `radar_captures`.
 */
class RadarConsent extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia;

    protected $fillable = [
        'radar_outreach_id', 'radar_advertiser_id', 'proof', 'capture_hashes', 'provider_message_id', 'transcript',
        'ai_verdict', 'verification_status', 'verification_reason', 'deposited_by_id',
        'confirmation_reason', 'revoked_at',
    ];

    // `confirmed_by_id` et `confirmed_at` hors de `$fillable` : posés ensemble par `forceFill` dans
    // `RadarConsentWorkflow::recordOutcome()`, et par lui seul (comme les colonnes de prise en charge de l'annonceur).

    protected $casts = [
        'proof' => RadarConsentProof::class,
        'verification_status' => RadarVerificationStatus::class,
        'capture_hashes' => 'array',
        'ai_verdict' => 'array',
        'confirmed_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    // Seulement ce que `RadarConsentResource` expose : ni les empreintes des captures, ni l'identifiant du message du
    // fournisseur, ni les auteurs (`*_by_id`, rendus par leur relation). Une route qui lira d'autres colonnes les ajoute ici.
    protected static array $queryFields = [
        'id', 'proof', 'transcript', 'ai_verdict', 'verification_status', 'verification_reason',
        'confirmed_at', 'confirmation_reason', 'revoked_at', 'created_at',
    ];

    public function registerMediaCollections(): void
    {
        // Aucun `useDisk()` : la collection tombe sur le disque par défaut, PRIVÉ (ADR-0029 §3).
        $this->addMediaCollection('radar_consent_captures');
    }

    public function outreach(): BelongsTo
    {
        return $this->belongsTo(RadarOutreach::class, 'radar_outreach_id');
    }

    public function advertiser(): BelongsTo
    {
        return $this->belongsTo(RadarAdvertiser::class, 'radar_advertiser_id');
    }

    public function depositor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deposited_by_id');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by_id');
    }

    /** Un accord valide : confirmé par un humain et non révoqué. La seule définition ; `RadarConsentCoverage` la lit. */
    public function scopeValid(Builder $query): Builder
    {
        return $query->whereNotNull('radar_consents.confirmed_at')->whereNull('radar_consents.revoked_at');
    }
}
