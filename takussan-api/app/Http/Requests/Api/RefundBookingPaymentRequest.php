<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Booking\BookingMoneyAccess;

/**
 * TCK-305 — extrait de BookingPaymentController::refund(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class RefundBookingPaymentRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ La règle n'est pas encore dans une policy : elle vit dans `BookingMoneyAccess` (TCK-596),
     * partagée avec l'enregistrement d'un paiement.
     */
    public function authorize(): bool
    {
        $booking = $this->route('payment')?->booking;
        $user = $this->user();

        // TCK-596 — plus `canManageBooking`, qui inclut le CLIENT (TCK-172, pour `store`) : `store`
        // le neutralisait ensuite, `refund` non. Le client faisait passer son propre acompte à
        // `refunded`, sans qu'aucun argent ne bouge. `bookings.refund` gagne ici son lecteur.
        return $user !== null && $booking !== null && BookingMoneyAccess::canRefund($user, $booking);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'refund_amount' => ['required', 'numeric', 'gt:0'],
            'refund_reason' => ['nullable', 'string'],
        ];
    }
}
