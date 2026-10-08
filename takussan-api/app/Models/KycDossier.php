<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Contracts\HasAuditAgency;
use App\Models\Enums\KycDossierStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\QueryBuilder\AllowedFilter;

class KycDossier extends AbstractModel implements HasAuditAgency, HasMedia
{
    use Auditable, InteractsWithMedia;

    protected $fillable = [
        'subject_type',
        'subject_id',
        'status',
        'submitted_at',
        'reviewed_at',
        'reviewed_by',
        'rejection_reason',
        'metadata',
        'expires_at',
    ];

    protected $casts = [
        'status' => KycDossierStatus::class,
        'submitted_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'expires_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['status', 'subject_id'];

    protected static array $requestSortable = ['id', 'submitted_at', 'reviewed_at', 'expires_at', 'created_at'];

    protected static array $requestLoadable = ['subject', 'reviewer'];

    protected static array $queryFields = [
        'id',
        'subject_type',
        'subject_id',
        'status',
        'submitted_at',
        'reviewed_at',
        'reviewed_by',
        'rejection_reason',
        'metadata',
        'expires_at',
        'created_at',
        'updated_at',
    ];

    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('subject_type', function (Builder $query, string $value): void {
                $query->where('subject_type', match ($value) {
                    'Agency' => Agency::class,
                    default => $value,
                });
            }),
        ];
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('documents');
    }

    public function subject(): MorphTo
    {
        return $this->morphTo();
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', KycDossierStatus::Pending);
    }

    public function scopeSubmitted(Builder $query): Builder
    {
        return $query->where('status', KycDossierStatus::Submitted);
    }

    public function scopeVerified(Builder $query): Builder
    {
        return $query->where('status', KycDossierStatus::Verified);
    }

    public function scopeRejected(Builder $query): Builder
    {
        return $query->where('status', KycDossierStatus::Rejected);
    }

    /** TCK-601 (ADR-0044 §3) — l'agence d'une activité sur un dossier est l'agence qu'il vérifie. */
    public function auditAgencyId(): ?int
    {
        return $this->subject_type === Agency::class && $this->subject_id !== null ? (int) $this->subject_id : null;
    }
}
