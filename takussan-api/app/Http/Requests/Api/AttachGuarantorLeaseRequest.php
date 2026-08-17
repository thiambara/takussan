<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\IdType;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de LeaseController::attachGuarantor(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class AttachGuarantorLeaseRequest extends BaseFormRequest
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
            'guarantor_id' => ['nullable', 'exists:guarantors,id'],
            'role' => ['nullable', 'string', 'max:50'],
            'first_name' => ['required_without:guarantor_id', 'string'],
            'last_name' => ['required_without:guarantor_id', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'id_type' => ['nullable', Rule::enum(IdType::class)],
            'id_number' => ['nullable', 'string'],
            'occupation' => ['nullable', 'string'],
            'employer' => ['nullable', 'string'],
            'monthly_income' => ['nullable', 'numeric', 'min:0'],
            'relationship_to_tenant' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
