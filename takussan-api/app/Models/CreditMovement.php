<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\CreditMovementType;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * TCK-633 lot F (ADR-0061 §2) — un mouvement du registre, en INSERTION SEULE. Le trigger
 * `credit_movements_append_only` le tient en base ; ce modèle le dit plus tôt, en PHP.
 */
class CreditMovement extends AbstractModel
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'agency_id', 'credit_lot_id', 'type', 'amount', 'property_boost_id', 'actor_id', 'reason',
    ];

    protected $casts = [
        'type' => CreditMovementType::class,
        'amount' => 'integer',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::updating(static fn () => throw new LogicException('credit_movements est en insertion seule (ADR-0061).'));
        static::deleting(static fn () => throw new LogicException('credit_movements est en insertion seule (ADR-0061).'));
    }

    /**
     * `UPDATED_AT = null` fait rendre `[created_at, null]` à `getDates()` du framework : un nom de
     * colonne NUL, que tout parcours des dates du modèle reçoit — mesuré sur
     * `DateInventoryByValueTest` (ADR-0018), qui mourait sur `setAttribute(null, …)`. Seul modèle du
     * dépôt sans `updated_at` à ce jour.
     *
     * @return list<string>
     */
    public function getDates(): array
    {
        return array_values(array_filter(parent::getDates(), 'is_string'));
    }

    /** @param  array<string, mixed>  $attributes */
    public static function record(array $attributes): self
    {
        return static::query()->create($attributes);
    }

    public function lot(): BelongsTo
    {
        return $this->belongsTo(CreditLot::class, 'credit_lot_id');
    }

    public function boost(): BelongsTo
    {
        return $this->belongsTo(PropertyBoost::class, 'property_boost_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
