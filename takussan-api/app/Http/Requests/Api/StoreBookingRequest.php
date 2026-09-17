<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de BookingController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreBookingRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'property_id' => ['required', 'exists:properties,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            // TCK-530 — facultatifs : le serveur calcule les deux (App\Services\Booking\BookingQuote)
            // et refuse un montant envoyé qui en diffère. `decimal:0,2` borne la forme que le
            // comparateur découpe sans flottant.
            'total_amount' => ['nullable', 'numeric', 'decimal:0,2', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'decimal:0,2', 'min:0'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            // Vérification adverse de TCK-530 — une arrivée passée était acceptée. Même règle que
            // `BookingRequestPublicPropertyRequest` ; `today` se juge dans le fuseau de l'appli (UTC,
            // l'heure de Dakar).
            'start_date' => ['nullable', 'date', 'after_or_equal:today'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'notes' => ['nullable', 'string'],
            'expires_at' => ['nullable', 'date'],
        ];
    }

    /**
     * Les deux refus de dates dans la langue de l'appelant : `validation.php` ne porte ni
     * `after` ni `after_or_equal`, qui retombaient sur l'anglais de Laravel.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'start_date.after_or_equal' => __('bookings.start_in_past'),
            'end_date.after_or_equal' => __('bookings.end_before_start'),
        ];
    }
}
