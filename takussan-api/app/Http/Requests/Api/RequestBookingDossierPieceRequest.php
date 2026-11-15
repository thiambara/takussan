<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Booking\BookingDossierService;

/**
 * TCK-2872 (ADR-0110 § 2) — `POST /api/bookings/{booking}/dossier/{piece}/request` : « Demander »
 * une pièce manquante au client. Aucun corps.
 */
class RequestBookingDossierPieceRequest extends BaseFormRequest
{
    /** Le personnel de l'agence du bien (`BookingPolicy::requestDossierPiece`), puis le 404 d'un séjour. */
    public function authorize(): bool
    {
        $booking = $this->route('booking');
        if ($this->user()?->can('requestDossierPiece', $booking) !== true) {
            return false;
        }
        app(BookingDossierService::class)->assertHasDossier($booking);

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
