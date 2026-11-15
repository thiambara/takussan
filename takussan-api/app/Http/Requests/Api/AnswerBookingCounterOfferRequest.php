<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2873 (ADR-0110 § 5) — `POST /api/bookings/{booking}/counter-offers/{counterOffer}/accept|decline` :
 * le CLIENT de la réservation seul (`BookingPolicy::answerCounterOffer`). Aucun corps.
 */
class AnswerBookingCounterOfferRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('answerCounterOffer', $this->route('booking')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
