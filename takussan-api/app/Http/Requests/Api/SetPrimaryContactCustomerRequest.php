<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Capability;
use App\Models\User;
use Closure;

/**
 * TCK-305 — extrait de CustomerController::setPrimaryContact(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class SetPrimaryContactCustomerRequest extends BaseFormRequest
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
        $customer = $this->route('customer');
        $user = $this->user();

        // TCK-591 — désigner le référent est un geste gardé par `crm.assign` dans l'agence du
        // client : la capacité n'avait aucun lecteur, et tout lecteur de la fiche le désignait.
        return $user?->can('view', $customer) === true
            && $user->can(Capability::CrmAssign->value, $customer);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'user_id' => [
                'required',
                'integer',
                'exists:users,id',
                // TCK-591 — le référent est du PERSONNEL de l'agence du client (agent, admin
                // d'agence). `exists:users,id` acceptait n'importe quel compte de la plateforme,
                // un agent d'une autre agence ou un bailleur compris.
                function (string $attribute, mixed $value, Closure $fail): void {
                    $agencyId = $this->route('customer')?->agency_id;
                    $target = User::find((int) $value);
                    // TCK-587 — prédicat « personnel de l'agence » ; `isStaffAt()` à sa fusion.
                    $isStaff = $agencyId !== null && $target !== null
                        && ($target->isAgentAt((int) $agencyId) || $target->isAgencyAdminAt((int) $agencyId));
                    if (! $isStaff) {
                        $fail(__('crm.customers.primary_contact_not_staff'));
                    }
                },
            ],
        ];
    }
}
