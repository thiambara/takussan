<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de SavedSearchController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreSavedSearchRequest extends BaseFormRequest
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

    /**
     * TCK-330 — `notification_frequency` porte `sometimes`, JAMAIS `nullable`.
     *
     * La colonne est `string()->default('daily')`, donc **NOT NULL**
     * (`2026_04_17_160021_create_saved_searches_table.php:16`). `nullable` acceptait le `null`
     * que `ConvertEmptyStringsToNull` (middleware global) fabrique à partir d'un `""`, et
     * `SavedSearch::create()` allait alors mourir sur la contrainte d'intégrité — **500** là où
     * la mise à jour rendait déjà 422 pour la même saisie.
     *
     * Décision produite par TCK-330 : « pas d'alerte » et « champ non renseigné » sont deux
     * états DISTINCTS. Le premier a déjà sa sentinelle, `off` — c'est elle que le client envoie
     * pour couper l'alerte, et le front l'envoie déjà
     * (`takussan-web/src/lib/schemas/search.ts`). Le second est l'ABSENCE de la clé, et la
     * colonne retombe alors sur son défaut. Le vide, lui, n'est ni l'un ni l'autre : il est
     * refusé.
     *
     * `sometimes` plutôt que rien : la règle est écrite à l'identique dans
     * `UpdateSavedSearchRequest`, pour que les deux requêtes ne puissent plus diverger en
     * silence.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string'],
            'criteria' => ['required', 'array'],
            'notification_frequency' => ['sometimes', 'in:off,daily,weekly,instant'],
        ];
    }
}
