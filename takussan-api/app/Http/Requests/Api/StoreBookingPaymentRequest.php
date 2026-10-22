<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\AuthorizesTransitionally;
use App\Models\Booking;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Services\Booking\BookingMoneyAccess;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de BookingPaymentController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreBookingPaymentRequest extends BaseFormRequest
{
    use AuthorizesTransitionally;

    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ **REPRISE, pas délégation** : cette règle n'est pas encore dans une policy — elle fait
     * partie des 19 helpers relevés hors périmètre de TCK-306. L'expression est reproduite à
     * l'identique ; son domicile définitif est une policy, et le ticket de suite doit la
     * convertir en délégation comme les 35 autres.
     */
    public function authorize(): bool
    {
        return $this->canManageBooking($this->route('booking'));
    }

    /**
     * Le client de la réservation qui n'en est pas aussi l'encaisseur : son paiement part `pending`
     * vers la passerelle, au montant que l'API dérive.
     */
    public function payeurClient(): bool
    {
        $booking = $this->route('booking');
        $user = $this->user();

        return $booking instanceof Booking
            && $user !== null
            && $booking->customer !== null
            && $booking->customer->user_id === $user->id
            && ! BookingMoneyAccess::canRecordAsCollector($user, $booking);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-1309 (P133.05) — le client ne fixe plus le montant : l'API le dérive (acompte, puis
            // reste dû), et ignore ce qu'il envoie. Le personnel le saisit, toujours.
            'amount' => [Rule::requiredIf(fn () => ! $this->payeurClient()), 'nullable', 'numeric', 'min:0'],
            'payment_type' => [Rule::requiredIf(fn () => ! $this->payeurClient()), 'nullable', Rule::enum(BookingPaymentType::class)],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            // VERIF-596 passe 5 — `cancelled` n'est posé que par le renouvellement d'un bail.
            'status' => ['nullable', Rule::enum(PaymentStatus::class)->except([PaymentStatus::Cancelled])],
            'paid_at' => ['nullable', 'date'],
            'transaction_id' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
