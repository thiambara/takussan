<?php

namespace App\Http\Requests\Concerns;

use App\Support\InstantRecu;

/**
 * TCK-2743 — l'accesseur des FormRequests dont le corps validé part tel quel vers un service : les
 * dates-heures qu'il déclare ({@see instantsRecus()}) sont ramenées à l'instant qu'elles désignent
 * ({@see InstantRecu}), et `null` reste `null`. Le contrôleur lit `validatedAvecInstants()` au lieu de
 * `validated()` ; la règle (`after:now`, `before_or_equal:now`) et l'écriture lisent le même instant.
 *
 * `validated()` reste intact, délibérément : surchargé, il changerait le type de la valeur pour tout
 * lecteur, sans couvrir `safe()` ni `input()`.
 */
trait ConvertitLesInstantsRecus
{
    /**
     * Les champs de premier niveau reçus en date-heure et écrits dans une colonne `datetime`.
     *
     * @return list<string>
     */
    abstract protected function instantsRecus(): array;

    /** @return array<string, mixed> */
    public function validatedAvecInstants(): array
    {
        $data = $this->validated();
        foreach ($this->instantsRecus() as $champ) {
            if (array_key_exists($champ, $data)) {
                $data[$champ] = InstantRecu::ouNul($data[$champ]);
            }
        }

        return $data;
    }
}
