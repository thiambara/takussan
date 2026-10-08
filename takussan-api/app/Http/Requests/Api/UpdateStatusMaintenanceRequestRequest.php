<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de MaintenanceRequestController::updateStatus(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateStatusMaintenanceRequestRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * TCK-592 — `update` seul laissait le prestataire annuler toute la demande et clore la sienne.
     * Le droit se juge désormais par (acteur, cible) : `MaintenanceRequestPolicy::transitionTo()`.
     * Une cible illisible n'est pas jugée ici : la validation rendra son 422 à qui a `update`.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $maintenanceRequest = $this->route('maintenanceRequest');

        if ($user?->can('update', $maintenanceRequest) !== true) {
            return false;
        }

        $target = MaintenanceStatus::tryFrom((string) $this->input('status'));
        if ($target === null) {
            return true;
        }

        return $user->can('transitionTo', [$maintenanceRequest, $target]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::enum(MaintenanceStatus::class)],
        ];
    }
}
