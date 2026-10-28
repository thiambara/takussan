<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\Enums\RadarOutreachOutcome;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * TCK-2388 (ADR-0077 §3, §4) — un message de démarchage à un annonceur : le texte EXACT du lien `wa.me`
 * (`message`, la concaténation des segments du composeur), la version des clauses employée, l'envoi, l'issue,
 * et la chaîne des relances (`follow_up_of_id`, une relance au plus par message). Il couvre une ou plusieurs
 * annonces (`radar_outreach_listing`).
 */
class RadarOutreach extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'radar_advertiser_id', 'channel', 'locale', 'clauses_version', 'salutation', 'summary', 'message',
        'follow_up_of_id', 'follow_up_rank', 'created_by_id', 'sent_at', 'sent_by_id',
        'outcome', 'outcome_at', 'outcome_by_id',
    ];

    protected $casts = [
        'channel' => RadarOutreachChannel::class,
        'outcome' => RadarOutreachOutcome::class,
        'sent_at' => 'datetime',
        'outcome_at' => 'datetime',
        'follow_up_rank' => 'integer',
    ];

    protected static array $queryFields = [
        'id', 'radar_advertiser_id', 'channel', 'locale', 'clauses_version', 'salutation', 'summary', 'message',
        'follow_up_of_id', 'follow_up_rank', 'created_by_id', 'sent_at', 'sent_by_id',
        'outcome', 'outcome_at', 'outcome_by_id', 'created_at', 'updated_at',
    ];

    public function advertiser(): BelongsTo
    {
        return $this->belongsTo(RadarAdvertiser::class, 'radar_advertiser_id');
    }

    public function listings(): BelongsToMany
    {
        return $this->belongsToMany(RadarListing::class, 'radar_outreach_listing');
    }

    public function consents(): HasMany
    {
        return $this->hasMany(RadarConsent::class, 'radar_outreach_id');
    }

    /** Le message dont celui-ci est la relance. */
    public function followUpOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'follow_up_of_id');
    }

    /** La relance de ce message, s'il y en a une : la chaîne est une liste, jamais un arbre. */
    public function followUp(): HasOne
    {
        return $this->hasOne(self::class, 'follow_up_of_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_id');
    }

    public function isSent(): bool
    {
        return $this->sent_at !== null;
    }

    /** La dernière réponse déposée sur ce message, la plus récente d'abord par date puis par identifiant. */
    public function latestReply(): ?RadarConsent
    {
        return $this->consents()->orderByDesc('created_at')->orderByDesc('id')->first();
    }
}
