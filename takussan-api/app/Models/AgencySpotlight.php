<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * TCK-2520 (ADR-0092) — une place « Mise en avant » de l'annuaire public des agences : une agence en
 * tête de l'annuaire d'une ville (`geo_city_id` nul : l'annuaire sans filtre), pendant `[starts_at,
 * ends_at)`. Offerte par la plateforme ; au plus une par ville et par instant (contraintes
 * d'exclusion de la migration). Sans statut : l'instant de la lecture dit si elle est active, et
 * l'éligibilité de l'agence se juge à la lecture ({@see self::scopeActiveAt()} n'en sait rien).
 *
 * @property int $id
 * @property int $agency_id
 * @property int|null $geo_city_id
 * @property Carbon $starts_at
 * @property Carbon $ends_at
 * @property int|null $granted_by_id
 * @property string|null $note
 * @property string $origin
 * @property int $price_credits
 * @property int|null $purchased_by_id
 * @property Carbon|null $cancelled_at
 * @property int $refunded_credits
 *
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — une place peut être ACHETÉE (`origin` `purchased`,
 * prix figé, acheteur) ; une place libérée (`cancelled_at`) garde sa ligne mais n'occupe plus la
 * ville : les deux portées ci-dessous l'ignorent, comme les contraintes d'exclusion.
 */
class AgencySpotlight extends AbstractModel
{
    public const ORIGIN_OFFERED = 'offered';

    public const ORIGIN_PURCHASED = 'purchased';

    protected $fillable = [
        'agency_id', 'geo_city_id', 'starts_at', 'ends_at', 'granted_by_id', 'note',
        'origin', 'price_credits', 'purchased_by_id', 'cancelled_at', 'refunded_credits',
    ];

    protected $attributes = [
        'origin' => self::ORIGIN_OFFERED,
        'price_credits' => 0,
        'refunded_credits' => 0,
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'price_credits' => 'integer',
        'refunded_credits' => 'integer',
    ];

    protected static array $requestFilterable = ['agency_id', 'geo_city_id'];

    protected static array $requestSortable = ['id', 'starts_at', 'ends_at'];

    protected static array $requestLoadable = ['agency', 'city', 'grantedBy', 'purchasedBy'];

    protected static array $queryFields = ['id', 'agency_id', 'geo_city_id', 'starts_at', 'ends_at', 'granted_by_id', 'note', 'origin', 'price_credits', 'purchased_by_id', 'cancelled_at', 'refunded_credits', 'created_at', 'updated_at'];

    public function isPurchased(): bool
    {
        return $this->origin === self::ORIGIN_PURCHASED;
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function city(): BelongsTo
    {
        return $this->belongsTo(GeoCity::class, 'geo_city_id');
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by_id');
    }

    public function purchasedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'purchased_by_id');
    }

    /** Les places qui occupent leur ville : non libérées. */
    public function scopeHeld(Builder $query): Builder
    {
        return $query->whereNull('cancelled_at');
    }

    /** La place de cette ville (nulle : l'annuaire sans ville) qui couvre l'instant. */
    public function scopeActiveAt(Builder $query, ?int $geoCityId, Carbon $instant): Builder
    {
        return $query
            ->whereNull('cancelled_at')
            ->when($geoCityId === null, fn (Builder $q) => $q->whereNull('geo_city_id'), fn (Builder $q) => $q->where('geo_city_id', $geoCityId))
            ->where('starts_at', '<=', $instant)
            ->where('ends_at', '>', $instant);
    }

    /** Les places de cette ville dont la période chevauche `[début, fin)`. */
    public function scopeOverlapping(Builder $query, ?int $geoCityId, Carbon $debut, Carbon $fin): Builder
    {
        return $query
            ->whereNull('cancelled_at')
            ->when($geoCityId === null, fn (Builder $q) => $q->whereNull('geo_city_id'), fn (Builder $q) => $q->where('geo_city_id', $geoCityId))
            ->where('starts_at', '<', $fin)
            ->where('ends_at', '>', $debut);
    }
}
