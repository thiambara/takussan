<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\ValidatesCustomerContactAndCriteria;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\IdType;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de CustomerController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateCustomerRequest extends BaseFormRequest
{
    use ValidatesCustomerContactAndCriteria {
        prepareForValidation as normalizeContact;
    }

    /**
     * TCK-591 (verif-591 passe 2, N4) — les critères appartiennent au personnel, en écriture comme en
     * lecture (m2). Pour un autre appelant (le bailleur auteur de la fiche), leurs clés sont
     * IGNORÉES : il ne les voit pas, et son formulaire les renvoyait vides, ce qui effaçait ceux que
     * l'agent avait saisis.
     */
    protected function prepareForValidation(): void
    {
        $this->normalizeContact();

        $customer = $this->route('customer');
        $user = $this->user();
        if ($customer instanceof Customer && $user !== null && ! $customer->criteriaBelongTo($user)) {
            $this->replace(Arr::except($this->all(), Customer::CRITERIA_FIELDS));
        }
    }

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
        return $this->user()?->can('view', $this->route('customer')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'first_name' => ['sometimes', 'string'],
            'last_name' => ['sometimes', 'string'],
            'email' => ['sometimes', 'nullable', 'email'],
            'id_type' => ['sometimes', 'nullable', Rule::enum(IdType::class)],
            'id_number' => ['sometimes', 'nullable', 'string'],
            'occupation' => ['sometimes', 'nullable', 'string'],
            'pipeline_stage' => ['sometimes', Rule::enum(CustomerPipelineStage::class)],
            'status' => ['sometimes', Rule::enum(CustomerStatus::class)],
            'notes' => ['sometimes', 'nullable', 'string'],
            // TCK-083 — optional reason captured when transitioning to a
            // terminal stage (`converted`/`lost`). Persisted as a CustomerNote.
            'reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
            ...$this->contactAndCriteriaRules('sometimes'),
        ];
    }
}
