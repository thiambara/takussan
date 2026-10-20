<?php

namespace App\Services\Search;

use App\Models\Address;
use App\Models\GeoNeighborhood;
use App\Support\Search\CleDeQuartier;

/**
 * TCK-663 (piste P01.02) — ce que le filtre `location` désigne, pour la liste comme pour la carte.
 *
 * Décision du porteur : une adresse rattachée au référentiel se juge par son `geo_neighborhood_id`,
 * une adresse non rattachée par son texte, sous la forme de {@see CleDeQuartier}. Les adresses ne
 * sont pas réécrites.
 *
 * Le panneau propose les noms du référentiel (« Grand Yoff ») ; les adresses non rattachées portent
 * le texte saisi (« Grand-Yoff ») : l'égalité stricte rendait 0 bien.
 */
final class QuartierDuFiltre
{
    /**
     * Les quartiers du référentiel dont le nom a la même clé que la saisie, quelle que soit leur
     * ville : le filtre `city`, s'il est posé, borne déjà le résultat. Un quartier fusionné est
     * remplacé par sa cible ; un ancien nom (`former_names`, écrit par un renommage) compte comme
     * un nom du quartier.
     *
     * @return list<int>
     */
    public function idsDuReferentiel(string $saisie): array
    {
        $cle = CleDeQuartier::de($saisie);
        if ($cle === null) {
            return [];
        }

        // TCK-1052 (P67.01) — un ancien nom fusionné désigne le quartier cible (décision du
        // porteur) : la fusion a réécrit les adresses vers la cible, aucune ne porte plus
        // l'identifiant de la source. La fusion ne fait jamais de chaîne
        // (`GeoNeighborhoodModeration::fusionner()`) : une étape suffit.
        // TCK-1080 (P67.02) — un ancien nom renommé désigne toujours le quartier (décision du
        // porteur) : `renommer()` le garde dans `former_names`.
        return GeoNeighborhood::query()
            ->get(['id', 'name', 'merged_into_id', 'former_names'])
            ->filter(static fn (GeoNeighborhood $q) => in_array($cle, array_map(
                static fn (mixed $nom) => CleDeQuartier::de(is_string($nom) ? $nom : null),
                [$q->name, ...($q->former_names ?? [])],
            ), true))
            ->map(static fn (GeoNeighborhood $q) => (int) ($q->merged_into_id ?? $q->id))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Les textes d'adresses NON rattachées qui ont la même clé que la saisie — la traduction SQL
     * de `neighborhood_key`, que la carte ne peut pas calculer en base (pas d'`unaccent`).
     *
     * @return list<string>
     */
    public function textesLibres(string $saisie): array
    {
        $cle = CleDeQuartier::de($saisie);
        if ($cle === null) {
            return [];
        }

        return Address::query()
            ->whereNull('geo_neighborhood_id')
            ->whereNotNull('neighborhood')
            ->distinct()
            ->pluck('neighborhood')
            ->filter(static fn (?string $texte) => CleDeQuartier::de($texte) === $cle)
            ->values()
            ->all();
    }
}
