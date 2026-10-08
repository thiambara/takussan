<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Review extends AbstractModel
{
    use HasFactory, SoftDeletes;

    /** Les cibles qu'un admin d'agence peut modérer : les autres relèvent de la plateforme seule. */
    public const AGENCY_MODERATED_TYPES = [Property::class, User::class];

    protected $fillable = [
        'reviewable_id', 'reviewable_type', 'author_id',
        'agency_id', 'context_type', 'context_id',
        'rating', 'title', 'content',
        'is_approved', 'approved_at', 'approved_by_id',
        'status', 'reported_count',
        'reply_content', 'replied_by_id', 'replied_at', 'metadata',
    ];

    protected $casts = [
        'rating' => 'integer',
        'is_approved' => 'boolean',
        'approved_at' => 'datetime',
        'replied_at' => 'datetime',
        'status' => ReviewStatus::class,
        'reported_count' => 'integer',
        'metadata' => 'array',
    ];

    /**
     * TCK-597 (ADR-0043 §1) — `agency_id` est le périmètre de modération, FIGÉ à la création :
     * dérivé de la cible quand l'appelant ne l'a pas posé (bien → son agence, agence → elle-même),
     * jamais réécrit ensuite. Un avis sur un agent ou un prestataire le reçoit de son contexte.
     */
    protected static function booted(): void
    {
        static::creating(function (self $review): void {
            if ($review->agency_id !== null) {
                return;
            }

            $review->agency_id = match ($review->reviewable_type) {
                Property::class => Property::query()->whereKey($review->reviewable_id)->value('agency_id'),
                Agency::class => $review->reviewable_id,
                default => null,
            };
        });

        static::updating(function (self $review): void {
            if ($review->isDirty('agency_id')) {
                $review->agency_id = $review->getOriginal('agency_id');
            }
        });
    }

    public function reviewable(): MorphTo
    {
        return $this->morphTo();
    }

    /** La preuve d'éligibilité : visite, bail, réservation ou intervention (ADR-0043 §3). */
    public function context(): MorphTo
    {
        return $this->morphTo();
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function isAgencyModerated(): bool
    {
        return in_array($this->reviewable_type, self::AGENCY_MODERATED_TYPES, true);
    }

    /** Vrai si la cible est un prestataire — sa note se lit par `ServiceProviderProfile::reviews()`. */
    public function targetsServiceProvider(): bool
    {
        return $this->reviewable_type === ServiceProviderProfile::class;
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function repliedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'replied_by_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }
}
