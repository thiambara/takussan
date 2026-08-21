<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Support\Carbon;

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

        foreach (['furnished', 'featured'] as $cle) {
            $valeur = $this->input($cle);

            if (! is_string($valeur)) {
                continue;
            }

            $normalise = filter_var($valeur, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

            if ($normalise !== null) {
                $this->merge([$cle => $normalise]);
            }
        }

        $this->ecreteDisponibiliteAuPresent();
    }

    /**
     * TCK-335 — une date de disponibilite ANTERIEURE au jour meme est ramenee a
     * aujourd'hui.
     *
     * Le defaut d'origine etait `after_or_equal:today`, qui faisait rendre 422 a
     * toute recherche sauvegardee le jour ou sa date passait. Le retirer seul aurait
     * ete PIRE, et c'est mesure : `available_from=2020-01-01` rend alors 200 avec
     * **8 biens sur 258** — les seuls dont `available_from` est nul, la clause du
     * service OR-joignant `IS NULL` a `<= <horodatage>`. On passait d'une erreur
     * bruyante a un mensonge discret, qu'aucune assertion « rend 200 » ne distingue.
     *
     * Ecreter restitue l'intention : une recherche ecrite hier pour « disponible des
     * maintenant » veut toujours dire « disponible des maintenant ».
     */
    private function ecreteDisponibiliteAuPresent(): void
    {
        $valeur = $this->input('available_from');

        if (! is_string($valeur)) {
            return;
        }

        try {
            $date = Carbon::parse($valeur);
        } catch (\Throwable) {
            // Chaine indatable : on ne touche a rien, la regle `date` rend le 422.
            return;
        }

        if ($date->isBefore(today())) {
            $this->merge(['available_from' => today()->toDateString()]);
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
            // TCK-335 — surface et « en vedette » etaient exposes par le panneau de
            // filtres et par le pied de page, et absents d'ici : `validated()` les
            // jetait en silence, l'interface affichait la puce, et le compte restait
            // celui du catalogue entier.
            'area_min' => 'nullable|numeric|min:0',
            'area_max' => 'nullable|numeric|min:0',
            'featured' => 'nullable|boolean',
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
