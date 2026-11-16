<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\QueryBuilder\AllowedFilter;

/**
 * TCK-633 lot F (ADR-0061 §1) — un lot daté de crédits d'un espace. Écrit par
 * `App\Services\Credits\CreditLedger` SEUL : `remaining_amount` n'a de sens qu'adossé aux
 * mouvements qui l'expliquent.
 */
class CreditLot extends AbstractModel
{
    protected $fillable = [
        'agency_id', 'origin', 'initial_amount', 'remaining_amount', 'expires_at',
        'granted_by_id', 'reason', 'expiry_notice_sent_at',
    ];

    protected $casts = [
        'origin' => CreditLotOrigin::class,
        'initial_amount' => 'integer',
        'remaining_amount' => 'integer',
        'expires_at' => 'datetime',
        'expiry_notice_sent_at' => 'datetime',
    ];

    /** Un lot dont il reste quelque chose et qui n'a pas expiré. */
    public function scopeSpendable(Builder $query): Builder
    {
        return $query->where('remaining_amount', '>', 0)
            ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    /**
     * TCK-2924 — les colonnes de `fields[credit_lots]` (`GET /api/credits/lots`). Ni `agency_id`, ni
     * `granted_by_id`, ni `expiry_notice_sent_at` : l'écran n'en a pas l'usage.
     */
    protected static array $queryFields = [
        'id', 'origin', 'initial_amount', 'remaining_amount', 'expires_at', 'reason', 'created_at',
    ];

    /**
     * TCK-2924 — `filter[state]=spent|expired`. La valeur est validée par `IndexCreditLotsRequest` ; une
     * valeur inconnue qui passerait ne rendrait rien.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('state', function (Builder $query, mixed $value): void {
                match ($value) {
                    'spent' => $query->spent(),
                    'expired' => $query->expired(),
                    default => $query->whereRaw('false'),
                };
            }),
        ];
    }

    /**
     * TCK-2924 — un lot DÉPENSÉ : consommé jusqu'à zéro par des mises en avant (ou un débit), sans
     * mouvement `expire`. L'expiration solde aussi le lot à 0 (`CreditLedger::expireDue`) : ce n'est pas
     * le solde nul qui distingue les deux états, c'est le mouvement. Exclusif de {@see scopeExpired()} ;
     * les deux réunis sont exactement le complément de {@see scopeSpendable()}.
     */
    public function scopeSpent(Builder $query): Builder
    {
        return $query->where('remaining_amount', '<=', 0)->whereDoesntHave('movements', self::expireMovement(...));
    }

    /**
     * TCK-2924 — un lot EXPIRÉ : soldé par un mouvement `expire`, ou échu avec un reste que le balayage
     * de la nuit n'a pas encore soldé. Un lot vidé avant sa date, puis dont la date passe, reste DÉPENSÉ.
     */
    public function scopeExpired(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereHas('movements', self::expireMovement(...))
            ->orWhere(fn (Builder $q) => $q->where('remaining_amount', '>', 0)
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', now())));
    }

    /** TCK-2924 — le complément de {@see scopeSpendable()} : ce que l'historique des lots rend. */
    public function scopeNotSpendable(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q->where('remaining_amount', '<=', 0)
            ->orWhere(fn (Builder $q) => $q->whereNotNull('expires_at')->where('expires_at', '<=', now())));
    }

    /** TCK-2924 — `expired` ou `spent`, en SQL, pour la colonne `state` de l'historique. */
    public static function stateSql(): string
    {
        $expire = CreditMovementType::Expire->value;

        return "CASE WHEN credit_lots.remaining_amount > 0 OR EXISTS (SELECT 1 FROM credit_movements m
            WHERE m.credit_lot_id = credit_lots.id AND m.type = '{$expire}') THEN 'expired' ELSE 'spent' END";
    }

    private static function expireMovement(Builder $movements): void
    {
        $movements->where('type', CreditMovementType::Expire->value);
    }

    /** ADR-0061 §2 : expiration la plus proche d'abord, sans expiration en dernier, puis ancienneté. */
    public function scopeInConsumptionOrder(Builder $query): Builder
    {
        return $query->orderByRaw('expires_at ASC NULLS LAST')->orderBy('created_at')->orderBy('id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by_id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(CreditMovement::class);
    }
}
