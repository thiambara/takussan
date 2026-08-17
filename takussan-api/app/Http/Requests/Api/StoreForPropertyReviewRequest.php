<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;

/**
 * TCK-305 — extrait de ReviewController::storeForProperty(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreForPropertyReviewRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur vérifiait l'éligibilité avant de valider ; un FormRequest valide avant le
     * corps du contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * éligible et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ **REPRISE, pas délégation** : il n'existe pas de `ReviewPolicy`. L'expression est
     * reproduite à l'identique ; son domicile définitif est une policy, et le ticket de suite
     * (les 19 helpers hors périmètre de TCK-306) doit la convertir en délégation.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $property = $this->route('property');

        if ($user === null || $property === null) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        $reservationHonoree = $property->bookings()
            ->whereIn('status', [BookingStatus::Completed, BookingStatus::Confirmed])
            ->whereHas('customer', fn ($q) => $q->where('user_id', $user->id))
            ->exists();

        $bail = $property->leases()
            ->whereIn('status', [LeaseStatus::Active, LeaseStatus::Terminated, LeaseStatus::Expired])
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $user->id))
            ->exists();

        return $reservationHonoree || $bail;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string'],
            'content' => ['nullable', 'string'],
        ];
    }
}
