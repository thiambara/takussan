<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\DossierPiece;
use App\Services\Booking\BookingDossierService;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2872 (ADR-0110 § 2) — une pièce du dossier d'une candidature ou d'une offre : attendue
 * (`required`), reçue (`document_id`, `received_at`), demandée (`requested_at`, `requested_by_id`).
 *
 * La liste est posée à la création de la réservation et ne s'écrit que par
 * {@see BookingDossierService}. La pièce reçue est un {@see Document} dont le
 * porteur est la réservation : elle se lit selon `DocumentPolicy` (ADR-0099), jamais par ici.
 */
class BookingDossierItem extends AbstractModel
{
    protected $fillable = [
        'booking_id', 'piece', 'required', 'document_id', 'requested_at', 'requested_by_id', 'received_at',
    ];

    protected $casts = [
        'piece' => DossierPiece::class,
        'required' => 'boolean',
        'requested_at' => 'datetime',
        'received_at' => 'datetime',
    ];

    protected static array $queryFields = [
        'id', 'booking_id', 'piece', 'required', 'document_id', 'requested_at', 'received_at',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }
}
