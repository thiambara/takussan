<?php

namespace App\Http\Requests\Public;

/**
 * TCK-305 — extrait de `PublicPropertyController::bookingRequest()`, où les règles étaient
 * construites dans une variable locale puis passées à `$request->validate($rules)`.
 *
 * TCK-176 — sur un bien à la VENTE, la « réservation » est en réalité une *offre d'achat* :
 * montant, échéance et acceptation des conditions, au lieu des dates et du nombre de personnes.
 * Le corps attendu dépend donc du bien, pas seulement de la requête.
 */
class BookingRequestPublicPropertyRequest extends PublicPropertySlugRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Le 404 sur un slug inconnu doit primer sur le 422 : cf. l'en-tête de la classe de base.
        $isSale = $this->property()->contract_type?->value === 'sale';

        return $isSale
            ? [
                'offer_amount' => ['required', 'numeric', 'min:1'],
                'offer_expires_at' => ['required', 'date', 'after:today'],
                'terms_accepted' => ['required', 'accepted'],
                'message' => ['nullable', 'string', 'max:1000'],
            ]
            : [
                'start_date' => ['required', 'date', 'after_or_equal:today'],
                'end_date' => ['required', 'date', 'after:start_date'],
                'guests' => ['required', 'integer', 'min:1', 'max:50'],
                'message' => ['nullable', 'string', 'max:1000'],
            ];
    }
}
