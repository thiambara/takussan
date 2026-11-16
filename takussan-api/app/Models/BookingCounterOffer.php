<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\CounterOfferStatus;
use App\Services\Booking\BookingCounterOfferService;
use App\Support\FinInclusive;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2873 (ADR-0110 § 5) — une contre-offre de l'agence sur une offre d'achat en attente : un
 * prix (`amount`), un message facultatif, une validité (`valid_until`, un JOUR, inclus jusqu'à la
 * fin de la journée de Dakar) et son état ({@see CounterOfferStatus}).
 *
 * Ne s'écrit que par {@see BookingCounterOfferService}, et se lit dans la
 * réservation (`BookingResource::counter_offer`, la dernière) : aucune route ne la lit seule.
 */
class BookingCounterOffer extends AbstractModel
{
    protected $fillable = [
        'booking_id', 'amount', 'message', 'valid_until', 'created_by_id', 'status', 'responded_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'valid_until' => 'date',
        'status' => CounterOfferStatus::class,
        'responded_at' => 'datetime',
    ];

    protected static array $queryFields = [
        'id', 'booking_id', 'amount', 'message', 'valid_until', 'status', 'responded_at', 'created_at',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    /** Échue : `valid_until` est passé (le jour lui-même compte, jusqu'à 23:59:59 à Dakar). */
    public function isOverdue(): bool
    {
        return $this->valid_until !== null
            && now()->greaterThan(FinInclusive::de($this->valid_until->toDateString()));
    }

    /** En attente d'une réponse du client : `pending` et non échue. */
    public function isOpen(): bool
    {
        return $this->status === CounterOfferStatus::Pending && ! $this->isOverdue();
    }
}
