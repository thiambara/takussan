<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-304/305 — extrait de PublicPropertyController::search(), ou les regles etaient inline.
 */
class SearchPublicPropertyRequest extends BaseFormRequest
{
    /**
     * L'autorisation reste dans le controleur / la policy (principes 1 et 2, TCK-306).
     * `BaseFormRequest` refuse par defaut : sans cette surcharge, l'endpoint rendrait 403.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * TCK-335 — le front serialise ses booleens avec `String(v)` et envoie donc la
     * CHAINE « true ». La regle `boolean` de Laravel n'accepte que
     * true/false/1/0/"1"/"0" : `?furnished=true` rendait 422 — sur le filtre le plus
     * courant d'un marche locatif, et dans les DEUX sens. On normalise ici plutot que
     * d'elargir la regle, pour que `?furnished=nimportequoi` continue de rendre 422
     * au lieu d'etre lu comme `false`.
     */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        $furnished = $this->input('furnished');

        if (is_string($furnished)) {
            $normalise = filter_var($furnished, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

            if ($normalise !== null) {
                $this->merge(['furnished' => $normalise]);
            }
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'q' => 'nullable|string|max:200',
            'search' => 'nullable|string|max:200',
            'location' => 'nullable|string|max:100',
            'city' => 'nullable|string|max:100',
            'price_min' => 'nullable|numeric|min:0',
            'price_max' => 'nullable|numeric|min:0',
            'bedrooms' => 'nullable|integer|min:0|max:50',
            'bathrooms' => 'nullable|integer|min:0|max:50',
            'type' => 'nullable|string|max:500',
            'contract_type' => 'nullable|in:sale,rent',
            'rent_period' => 'nullable|string',
            'furnished' => 'nullable|boolean',
            'tags' => 'nullable|string',
            'lat_min' => 'nullable|numeric',
            'lat_max' => 'nullable|numeric',
            'lng_min' => 'nullable|numeric',
            'lng_max' => 'nullable|numeric',
            'sort' => 'nullable|in:relevance,price_asc,price_desc,created_desc',
            'floor_number' => 'nullable|integer|min:0|max:200',
            // TCK-335 — `after_or_equal:today` faisait POURRIR toute recherche sauvegardee
            // et tout lien partage : le jour ou la date passait, l'URL rendait 422, et le
            // front affichait « 0 bien trouve ». La borne n'a de sens qu'a la SAISIE, pas a
            // la relecture d'une URL ecrite hier. `date` reste, elle garde le 422 sur
            // `available_from=not-a-date` (PublicPropertySearchFiltersTest).
            'available_from' => 'nullable|date',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ];
    }
}
