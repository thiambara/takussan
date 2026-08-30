<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de MaintenanceRequestController::uploadPhotos(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UploadPhotosMaintenanceRequestRequest extends BaseFormRequest
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
     *
     * TCK-445 — **`can('view')` ici est une DÉCISION, pas un oubli.** `view` inclut le DEMANDEUR
     * (`MaintenanceRequestPolicy::view()`) : un locataire peut donc alimenter la collection
     * `photos` de sa propre demande tant qu'elle n'est ni close ni annulée. Compléter son propre
     * signalement est légitime, et c'est la même personne qui l'a ouvert.
     *
     * La collection sensible, elle, reste gardée : `completion_photos` re-autorise `update` dans
     * `MaintenanceRequestController::uploadPhotos()` — le rapport de fin d'intervention n'est pas
     * un complément de signalement. La décision est écrite en toutes lettres dans
     * `docs/features.md` §1.8 et épinglée par
     * `tests/Feature/Api/MaintenancePrincipalFieldsTest::test_requester_can_still_add_photos_to_his_own_report()`,
     * pour qu'un resserrement futur soit un choix et non un effet de bord.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('view', $this->route('maintenanceRequest')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'photos' => ['required', 'array', 'min:1'],
            'photos.*' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
            'collection' => ['nullable', 'string', Rule::in(['photos', 'completion_photos'])],
        ];
    }
}
