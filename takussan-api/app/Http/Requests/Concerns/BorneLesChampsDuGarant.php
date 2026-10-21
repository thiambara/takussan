<?php

namespace App\Http\Requests\Concerns;

/**
 * TCK-1108 (P91.03) — les longueurs des colonnes de `guarantors`, que partagent les trois requêtes
 * qui écrivent un garant (création, modification, ajout d'un garant neuf à un bail). Sans elles,
 * une valeur trop longue atteignait PostgreSQL (22001) et rendait 500 au lieu de 422.
 */
trait BorneLesChampsDuGarant
{
    /** La largeur de chaque colonne `varchar` de `guarantors` que la requête reçoit telle quelle. */
    public const BORNES_DU_GARANT = [
        'first_name' => 255,
        'last_name' => 255,
        'phone' => 30,
        'occupation' => 255,
        'employer' => 255,
        'relationship_to_tenant' => 255,
    ];

    /**
     * Ajoute à chaque règle de la liste la borne `max:` de sa colonne.
     *
     * @param  array<string, array<int, mixed>>  $rules
     * @return array<string, array<int, mixed>>
     */
    protected function borneLesChampsDuGarant(array $rules): array
    {
        foreach (self::BORNES_DU_GARANT as $cle => $longueur) {
            $rules[$cle][] = 'max:'.$longueur;
        }

        return $rules;
    }
}
