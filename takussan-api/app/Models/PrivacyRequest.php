<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\PrivacyRequestChannel;
use App\Models\Enums\PrivacyRequestStatus;
use App\Models\Enums\PrivacyRequestType;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\Activitylog\Support\LogOptions;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\QueryBuilder\AllowedFilter;

/**
 * TCK-601 (ADR-0044 §4) — une demande de droits (accès, rectification, opposition, effacement,
 * portabilité) et son suivi jusqu'à l'échéance légale.
 *
 * Alimenté de deux façons : à la main par le super-admin (demande reçue par courriel, par courrier),
 * et par les observateurs de `DataExport` (→ `portability`) et d'`AccountDeletionRequest`
 * (→ `erasure`, puis `withdrawn` à l'annulation — l'entrée ne disparaît jamais avec la demande).
 * La preuve de réponse est un média privé (`proof`).
 *
 * Journal `Privacy`, en liste blanche : ni le nom, ni le contact, ni le résumé de réponse — ce sont
 * des données du demandeur, et le journal se lit plus largement que le registre.
 */
class PrivacyRequest extends AbstractModel implements HasMedia
{
    use Auditable, InteractsWithMedia;

    public const LOG_NAME = 'Privacy';

    protected $fillable = [
        'user_id',
        'requester_name',
        'requester_contact',
        'type',
        'channel',
        'received_at',
        'due_at',
        'status',
        'answered_at',
        'response_summary',
        'handled_by',
        'data_export_id',
        'account_deletion_request_id',
    ];

    protected $casts = [
        'type' => PrivacyRequestType::class,
        'channel' => PrivacyRequestChannel::class,
        'status' => PrivacyRequestStatus::class,
        'received_at' => 'datetime',
        'due_at' => 'datetime',
        'answered_at' => 'datetime',
    ];

    protected $attributes = [
        'status' => 'received',
    ];

    protected static array $requestFilterable = ['status', 'type', 'channel', 'user_id'];

    protected static array $requestSortable = ['id', 'due_at', 'received_at', 'answered_at', 'created_at'];

    protected static array $requestLoadable = ['user', 'handler'];

    protected static array $queryFields = [
        'id',
        'user_id',
        'requester_name',
        'requester_contact',
        'type',
        'channel',
        'received_at',
        'due_at',
        'status',
        'answered_at',
        'response_summary',
        'handled_by',
        'data_export_id',
        'account_deletion_request_id',
        'created_at',
        'updated_at',
    ];

    protected static function booted(): void
    {
        // `due_at` se dérive de `received_at` : jamais saisi, toujours le délai de la configuration.
        static::saving(function (PrivacyRequest $request): void {
            if ($request->received_at !== null && ($request->due_at === null || $request->isDirty('received_at'))) {
                $request->due_at = self::dueFrom($request->received_at);
            }
        });
    }

    public static function dueFrom(CarbonInterface $receivedAt): CarbonInterface
    {
        return $receivedAt->copy()->addDays((int) config('privacy.rights_request_deadline_days', 30));
    }

    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('overdue', function (Builder $query, mixed $value): void {
                if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                    $query->overdue();
                }
            }),
        ];
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['type', 'channel', 'status', 'received_at', 'due_at', 'answered_at', 'handled_by', 'user_id'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges()
            ->useLogName(self::LOG_NAME);
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('proof')->singleFile();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function handler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->whereIn('status', [PrivacyRequestStatus::Received->value, PrivacyRequestStatus::InProgress->value])
            ->where('due_at', '<', now());
    }

    public function isOverdue(): bool
    {
        return $this->status?->isOpen() === true && $this->due_at !== null && $this->due_at->isPast();
    }
}
