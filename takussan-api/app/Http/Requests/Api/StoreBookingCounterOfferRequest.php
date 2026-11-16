<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Rules\JourIso;
use App\Services\Booking\BookingCounterOfferService;

/**
 * TCK-2873 (ADR-0110 § 5) — `POST /api/bookings/{booking}/counter-offers` : le personnel de l'agence
 * du bien, sous `bookings.validate` (`BookingPolicy::proposeCounterOffer`), contre-propose un prix.
 *
 * - `amount` : XOF ENTIER, > 0 (principe 3 : XOF n'a pas de sous-unité) ;
 * - `message` : facultatif, 500 caractères au plus ;
 * - `valid_until` : un jour (`Y-m-d`), d'aujourd'hui à J+30 (jours de Dakar) ; J+3 par défaut.
 */
class StoreBookingCounterOfferRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('proposeCounterOffer', $this->route('booking')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $today = BookingCounterOfferService::today();

        return [
            'amount' => ['required', 'integer', 'min:1', 'max:'.(int) StoreBookingRequest::MAX_AMOUNT],
            'message' => ['nullable', 'string', 'max:500'],
            'valid_until' => [
                'nullable', 'date_format:Y-m-d', new JourIso,
                'after_or_equal:'.$today->toDateString(),
                'before_or_equal:'.$today->copy()->addDays(BookingCounterOfferService::MAX_VALIDITY_DAYS)->toDateString(),
            ],
        ];
    }
}
