<?php

namespace App\Services\Search;

use App\Models\GeoCity;
use App\Support\Search\CleDeQuartier;

/**
 * TCK-1169 (P99.01) — ce qu'un nom de ville rangé dans un critère désigne encore quand le jeu du
 * référentiel a renommé la ville : comme pour les quartiers (TCK-1080, {@see QuartierDuFiltre}),
 * un ancien nom (`geo_cities.former_names`) désigne toujours la ville.
 *
 * Le texte des adresses suit le nouveau nom (TCK-787) : un critère sous l'ancien nom (alerte
 * `city` / `cities`, ville d'un prospect) ne trouvait plus rien, sans erreur.
 */
final class VilleDuFiltre
{
    /** @var list<array{name: string, anciennes: list<string>}>|null */
    private ?array $renommees = null;

    /**
     * Les noms ACTUELS des villes dont un ancien nom a la clé de la saisie ({@see CleDeQuartier}).
     *
     * @return list<string>
     */
    public function nomsActuels(string $saisie): array
    {
        $cle = CleDeQuartier::de($saisie);
        if ($cle === null) {
            return [];
        }

        return array_values(array_unique(array_map(
            static fn (array $ville) => $ville['name'],
            array_filter($this->renommees(), static fn (array $ville) => in_array($cle, $ville['anciennes'], true)),
        )));
    }

    /**
     * Les clés des anciens noms de la ville, pour le sens inverse du rapprochement.
     *
     * @return list<string>
     */
    public function clesAnciennes(?int $villeId): array
    {
        if ($villeId === null) {
            return [];
        }

        $anciens = GeoCity::query()->whereKey($villeId)->value('former_names');

        return array_values(array_filter(array_map(
            static fn (mixed $nom) => CleDeQuartier::de(is_string($nom) ? $nom : null),
            is_array($anciens) ? $anciens : [],
        )));
    }

    /** @return list<array{name: string, anciennes: list<string>}> */
    private function renommees(): array
    {
        return $this->renommees ??= GeoCity::query()
            ->whereNotNull('former_names')
            ->get(['name', 'former_names'])
            ->map(static fn (GeoCity $ville) => [
                'name' => (string) $ville->name,
                'anciennes' => array_values(array_filter(array_map(
                    static fn (mixed $nom) => CleDeQuartier::de(is_string($nom) ? $nom : null),
                    $ville->former_names ?? [],
                ))),
            ])
            ->values()
            ->all();
    }
}
