<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\VisitType;
use App\Models\PropertyVisit;
use App\Rules\PersonnelDeLAgence;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PropertyVisitController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 *
 * TCK-590 — `scheduled_at` acceptait une heure PASSÉE (`sometimes|date`), et `agent_id`
 * n'importe quel compte de la plateforme (`exists:users,id`), qui devenait titulaire de `update`.
 * L'heure est future (contrainte 11), l'agent est du personnel de l'agence du bien (contrainte 2).
 */
class UpdatePropertyVisitRequest extends BaseFormRequest
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
        return $this->user()?->can('update', $this->route('visit')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $visit = $this->route('visit');
        $agencyId = $visit instanceof PropertyVisit ? $visit->property?->agency_id : null;

        return [
            'scheduled_at' => ['sometimes', 'date', 'after:now'],
            'agent_id' => ['sometimes', 'nullable', 'integer', new PersonnelDeLAgence($agencyId)],
            'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:5'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'type' => ['sometimes', Rule::enum(VisitType::class)],
        ];
    }
}
