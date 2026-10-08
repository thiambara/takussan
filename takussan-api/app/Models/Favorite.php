<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Favorite extends AbstractModel
{
    use HasFactory;

    public const AVAILABLE = 'available';

    public const RENTED = 'rented';

    public const SOLD = 'sold';

    public const UNAVAILABLE = 'unavailable';

    public const REMOVED = 'removed';

    protected $fillable = ['user_id', 'property_id', 'notes', 'alert_baseline_price', 'unavailable_notified_at'];

    /**
     * TCK-599 §5 — la base d'alerte reste un DÉCIMAL en chaîne (contrainte 9) : jamais de flottant
     * entre la colonne et la comparaison ({@see self::cents()}).
     */
    protected $casts = [
        'alert_baseline_price' => 'decimal:2',
        'unavailable_notified_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    /**
     * TCK-599 §1 — POURQUOI un favori n'est plus décrit. `$isPublic` vient de `scopePublic()`
     * (par `withExists`), jamais d'une copie de ses conditions. Loué ou vendu ne se dit que d'un
     * bien qui serait public sans son statut : le dire d'un bien privé ou de test révélerait un
     * état interne.
     */
    public static function availabilityOf(?Property $property, bool $isPublic): string
    {
        if ($property === null || $property->trashed()) {
            return self::REMOVED;
        }
        if ($isPublic) {
            return self::AVAILABLE;
        }

        $publicOtherwise = $property->visibility === PropertyVisibility::Public
            && ! $property->is_test
            && $property->published_at !== null;

        return match (true) {
            $publicOtherwise && $property->status === PropertyStatus::Rented => self::RENTED,
            $publicOtherwise && $property->status === PropertyStatus::Sold => self::SOLD,
            default => self::UNAVAILABLE,
        };
    }

    /**
     * Un montant `decimal(14,2)` en centimes entiers, sans passer par un flottant : `"450000.5"`
     * → `45000050`. Quatorze chiffres tiennent dans un entier 64 bits.
     */
    public static function cents(string|int|float|null $amount): ?int
    {
        if ($amount === null || $amount === '') {
            return null;
        }
        $amount = is_string($amount) ? trim($amount) : number_format((float) $amount, 2, '.', '');
        $negative = str_starts_with($amount, '-');
        [$units, $fraction] = array_pad(explode('.', ltrim($amount, '-+'), 2), 2, '');
        $cents = (int) $units * 100 + (int) str_pad(substr($fraction, 0, 2), 2, '0');

        return $negative ? -$cents : $cents;
    }
}
