<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Property;
use App\Rules\AssignableProvider;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de MaintenanceRequestController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreMaintenanceRequestRequest extends BaseFormRequest
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

    private function targetProperty(): ?Property
    {
        $id = $this->input('property_id');

        return is_numeric($id) ? Property::query()->find((int) $id) : null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'property_id' => ['required', 'exists:properties,id'],
            'lease_id' => ['nullable', 'exists:leases,id'],
            // TCK-592 — un compte assignable au bien visé (prestataire actif en collaboration active
            // avec son agence, ou membre de son équipe).
            'assigned_to' => ['nullable', 'integer', new AssignableProvider($this->targetProperty())],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['required', 'string'],
            'category' => ['required', Rule::enum(MaintenanceCategory::class)],
            'priority' => ['nullable', Rule::enum(MaintenancePriority::class)],
        ];
    }
}
