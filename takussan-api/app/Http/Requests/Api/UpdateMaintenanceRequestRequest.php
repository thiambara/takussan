<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de MaintenanceRequestController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateMaintenanceRequestRequest extends BaseFormRequest
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
            'assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
            'priority' => ['sometimes', Rule::enum(MaintenancePriority::class)],
            'status' => ['sometimes', Rule::enum(MaintenanceStatus::class)],
            'estimated_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'actual_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'scheduled_at' => ['sometimes', 'nullable', 'date'],
            'started_at' => ['sometimes', 'nullable', 'date'],
            'completed_at' => ['sometimes', 'nullable', 'date'],
            'resolution_notes' => ['sometimes', 'nullable', 'string'],
            'resolution_report' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
