<?php

namespace App\Http\Requests\Concerns;

use App\Support\ReglesDElementBornees;

/**
 * TCK-2488 — une liste qui dépasse sa borne (`array` + `max:N`, `array:clés`, `prohibited`) ne fait
 * pas valider ses éléments un à un : le parent rend son 422 seul. Sans lui, Laravel juge chaque élément
 * même après l'échec de la borne (revue de TCK-2483, M1 : 20 000 éléments, 29 s, 2 Mo de 422).
 *
 * Porté par `BaseFormRequest`, et par chaque FormRequest qui étend encore `FormRequest` en direct
 * (TCK-730) et porte une règle `.*` bornée. `ReglesDElementBorneesTest` recense les FormRequest et
 * rougit si l'une d'elles juge encore ses éléments hors borne.
 */
trait BorneLesReglesDElement
{
    /**
     * Les règles de `rules()`, moins les règles d'élément d'une liste que son parent refuse d'office,
     * sur les données que le validateur recevra (après `prepareForValidation()`).
     *
     * @return array<string, mixed>
     */
    protected function validationRules()
    {
        return ReglesDElementBornees::retirer(parent::validationRules(), $this->validationData());
    }
}
