<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de DocumentShareLinkController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreDocumentShareLinkRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * TCK-587 (passe 2 N2) — la règle vit désormais dans `DocumentPolicy::share()`, son domicile
     * annoncé ici depuis TCK-306 : un bailleur suspendu dans l'agence du porteur y perd le partage,
     * ce qu'une expression recopiée n'aurait pas suivi.
     */
    public function authorize(): bool
    {
        $document = $this->route('document');

        return $document !== null && $this->user()?->can('share', $document) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'expires_at' => ['nullable', 'date', 'after:now'],
            'max_downloads' => ['nullable', 'integer', 'min:1'],
            'password' => ['nullable', 'string', 'min:4'],
        ];
    }
}
