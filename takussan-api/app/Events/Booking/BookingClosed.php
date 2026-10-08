<?php

namespace App\Events\Booking;

use App\Models\Booking;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-596 — une réservation se ferme sans avoir eu lieu : annulée, refusée ou expirée (par le
 * seuil de l'agence, par son échéance propre, ou par `expire-now`). Un acompte encaissé sur
 * l'une d'elles doit devenir une tâche, quel que soit le chemin qui l'a fermée.
 */
class BookingClosed implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public const REASON_CANCELLED = 'cancelled';

    public const REASON_REJECTED = 'rejected';

    public const REASON_EXPIRED = 'expired';

    public function __construct(
        public Booking $booking,
        public string $reason,
        public ?int $authorId = null,
    ) {}
}
