<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Webhooks\WebhookPayloadRedactor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\QueryBuilder\AllowedFilter;

/**
 * TCK-602 (ADR-0051 §4) — une ligne par webhook entrant, écrite avant tout traitement.
 *
 * `body` (les octets reçus) et `headers` (la liste blanche du canal) sont CHIFFRÉS et ne sortent
 * par aucune sérialisation ni aucun `fields[]` : seul le rejeu les relit. `payload` est la vue
 * expurgée ({@see WebhookPayloadRedactor}).
 */
class IntegrationWebhookLog extends AbstractModel
{
    public const STATUS_RECEIVED = 'received';

    public const STATUS_PROCESSED = 'processed';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_FAILED = 'failed';

    public const CHANNEL_PAYMENT = 'payment';

    public const CHANNEL_SMS = 'sms';

    public const CHANNEL_WHATSAPP = 'whatsapp';

    public const CHANNELS = [self::CHANNEL_PAYMENT, self::CHANNEL_SMS, self::CHANNEL_WHATSAPP];

    protected $fillable = [
        'integration_id',
        'agency_id',
        'channel',
        'route_name',
        'provider',
        'direction',
        'status',
        'event_type',
        'payload',
        'body',
        'body_sha256',
        'body_truncated',
        'headers',
        'http_method',
        'authenticated_at',
        'http_status',
        'error_code',
        'error_message',
        'external_id',
        'matched_count',
        'attempts',
        'replayed_at',
        'replayed_by_id',
        'processed_at',
    ];

    protected $hidden = ['body', 'headers', 'body_sha256'];

    protected $casts = [
        'payload' => 'array',
        'body' => 'encrypted',
        'headers' => 'encrypted:array',
        'body_truncated' => 'boolean',
        'authenticated_at' => 'datetime',
        'replayed_at' => 'datetime',
        'processed_at' => 'datetime',
        'http_status' => 'integer',
        'matched_count' => 'integer',
        'attempts' => 'integer',
    ];

    protected static array $requestFilterable = ['channel', 'provider', 'status', 'agency_id', 'integration_id'];

    protected static array $requestSortable = ['id', 'created_at', 'status', 'provider', 'channel', 'http_status'];

    /** Jamais `body` ni `headers` (ADR-0051 §4), ni `body_sha256` (VERIF-602 m2). */
    protected static array $queryFields = [
        'id', 'integration_id', 'agency_id', 'channel', 'route_name', 'provider', 'direction', 'status', 'event_type',
        'payload', 'body_truncated', 'http_method', 'authenticated_at', 'http_status',
        'error_code', 'error_message', 'external_id', 'matched_count', 'attempts', 'replayed_at',
        'replayed_by_id', 'processed_at', 'created_at', 'updated_at',
    ];

    public function integration(): BelongsTo
    {
        return $this->belongsTo(Integration::class)->withTrashed();
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /**
     * `filter[unmatched]=1` : traité, et n'a rien apparié.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('unmatched', function (Builder $query, mixed $value): void {
                if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                    $query->where('status', self::STATUS_PROCESSED)->where('matched_count', 0);
                }
            }),
        ];
    }

    /**
     * ADR-0051 §5 — une ligne se rejoue si elle a été AUTHENTIFIÉE, qu'elle a échoué ou n'a rien
     * apparié, et que son corps est gardé entier. Une ligne rejetée ne se rejoue jamais : ce serait
     * un contournement de signature.
     */
    public function isReplayable(): bool
    {
        if ($this->authenticated_at === null || $this->body_truncated) {
            return false;
        }
        // `body` n'est lu que par le rejeu : une liste à `fields[]` ne le charge pas (il est hors des
        // champs permis), et juge alors sur `body_truncated`, qui le dit aussi.
        if (array_key_exists('body', $this->getAttributes()) && $this->getAttributes()['body'] === null) {
            return false;
        }

        return $this->status === self::STATUS_FAILED
            || ($this->status === self::STATUS_PROCESSED && $this->matched_count === 0);
    }
}
