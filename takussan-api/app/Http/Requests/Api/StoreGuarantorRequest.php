<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\IdType;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de GuarantorController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreGuarantorRequest extends BaseFormRequest
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
            'first_name' => ['required', 'string'],
            'last_name' => ['required', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'id_type' => ['nullable', Rule::enum(IdType::class)],
            'id_number' => ['nullable', 'string'],
            'occupation' => ['nullable', 'string'],
            'employer' => ['nullable', 'string'],
            'monthly_income' => ['nullable', 'numeric', 'min:0'],
            'relationship_to_tenant' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'metadata' => ['nullable', 'array'],
        ];
    }
}
