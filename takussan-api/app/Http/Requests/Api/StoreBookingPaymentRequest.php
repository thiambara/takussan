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
            // TCK-1924 (P170.06) — `gt:0` pour le personnel : une ligne à 0 naissait `paid` avec un
            // numéro de reçu. Même règle que la ligne de bail (TCK-958). Le montant du client est
            // ignoré, sa règle ne change pas.
            'amount' => [Rule::requiredIf(fn () => ! $this->payeurClient()), 'nullable', 'numeric', $this->payeurClient() ? 'min:0' : 'gt:0'],
            'payment_type' => [Rule::requiredIf(fn () => ! $this->payeurClient()), 'nullable', Rule::enum(BookingPaymentType::class)],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            // VERIF-596 passe 5 — `cancelled` n'est posé que par le renouvellement d'un bail.
            // TCK-1311 (P147.09) — une ligne saisie à la main naît `paid`, `pending` ou
            // `partially_paid` : `refunded` passe par le geste `refund`, `failed` et `late` ne se
            // déclarent pas à la création.
            // TCK-1918 (P170.03, décision du porteur) — plus `partially_paid` : la ligne n'était
            // comptée ni dans le dû du client ni au reversement. Une part reçue est une ligne `paid`
            // de son montant.
            'status' => ['nullable', Rule::enum(PaymentStatus::class)->only([PaymentStatus::Paid, PaymentStatus::Pending])],
            // TCK-2286 (P227.04, décision du porteur) — une ligne `pending` n'a pas de date
            // d'encaissement : gardée, elle survivait au règlement par la passerelle
            // (`paid_at ??= now()`). 422, comme la ligne de bail (TCK-681). Sans `status`, la ligne
            // naît `paid` et garde sa date : d'où `prohibited_if` et non `prohibited_unless`.
            'paid_at' => ['nullable', 'date', 'prohibited_if:status,'.PaymentStatus::Pending->value],
            'transaction_id' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
