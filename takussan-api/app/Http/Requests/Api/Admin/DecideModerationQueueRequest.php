<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\ModerationReasonCode;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de ModerationQueueController::decide(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class DecideModerationQueueRequest extends BaseFormRequest
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
        // TCK-597 (ADR-0043 §8) — le motif est un CODE ; le texte libre n'est exigé que pour
        // `other`. Le couple (type d'élément, décision) se juge dans `UnifiedModerationService`,
        // qui seul connaît le type : 422 `moderation.decision_invalid_for_type`.
        return [
            'decision' => ['required', Rule::in(['approve', 'reject', 'hide', 'remove'])],
            'reason_code' => ['exclude_if:decision,approve', 'required', Rule::enum(ModerationReasonCode::class)],
            'reason' => ['nullable', 'string', 'max:1000', 'required_if:reason_code,other'],
        ];
    }
}
