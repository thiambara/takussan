<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de LeasePaymentController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreLeasePaymentRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * **Simple DÉLÉGATION** : la règle vit dans sa policy, cette méthode ne fait que l'invoquer —
     * aucune règle d'autorisation n'a migré ici (AC4).
     */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('lease')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'amount' => ['required', 'numeric', 'min:0'],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'payment_type' => ['required', Rule::enum(LeasePaymentType::class)],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
