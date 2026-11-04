<?php

namespace App\Services\Search\Query;

use App\Support\Search\CleDeQuartier;

/**
 * TCK-2473 — un {@see PlaceLexicon} tenu en mémoire : la correspondance elle-même, sans source. {@see DatabasePlaceLexicon}
 * lui passe le référentiel ; les tests du parseur, quelques lieux.
 *
 * Chaque écriture (`spelling` : le nom, un ancien nom, le nom d'un quartier fusionné, plus tard un alias) se replie par
 * {@see CleDeQuartier::de()} — la clé du filtre `location` : minuscules, sans accents, ponctuation ramenée à une espace.
 *
 * Deux arbitrages, mesurés sur le référentiel du 2026-11-04 :
 *   - une même clé qui est une ville ET un quartier (`pikine`, `colobane`…) désigne la VILLE ;
 *   - une même clé portée par des quartiers de villes différentes (`medina` : Dakar et Saint-Louis) garde le premier
 *     nom et perd sa ville (`city = null`) : on ne choisit pas une ville au hasard.
 */
final class InMemoryPlaceLexicon implements PlaceLexicon
{
    /** @var array<string, list<array{words: list<string>, kind: 'city'|'neighborhood', name: string, city: ?string}>> par premier mot, du plus long au plus court */
    private array $index = [];

    /**
     * @param  iterable<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}>  $entries
     */
    public function __construct(iterable $entries)
    {
        /** @var array<string, array{kind: 'city'|'neighborhood', name: string, city: ?string}> $byKey */
        $byKey = [];
        foreach ($entries as $entry) {
            $key = CleDeQuartier::de($entry['spelling']);
            if ($key === null) {
                continue;
            }
            $known = $byKey[$key] ?? null;
            if ($known === null || ($known['kind'] === 'neighborhood' && $entry['kind'] === 'city')) {
                $byKey[$key] = ['kind' => $entry['kind'], 'name' => $entry['name'], 'city' => $entry['city']];
            } elseif ($known['kind'] === 'neighborhood' && $entry['kind'] === 'neighborhood' && $known['city'] !== $entry['city']) {
                $byKey[$key]['city'] = null;
            }
        }

        foreach ($byKey as $key => $place) {
            $words = explode(' ', (string) $key);
            $this->index[$words[0]][] = ['words' => $words, ...$place];
        }
        foreach ($this->index as &$candidates) {
            usort($candidates, static fn (array $a, array $b): int => count($b['words']) <=> count($a['words']));
        }
    }

    public function longestMatch(array $words): ?array
    {
        // Un mot de la saisie peut se replier en plusieurs (« Sacré-Cœur » → `sacre coeur`) : on aplatit en gardant,
        // pour chaque sous-mot, le rang du mot de la saisie dont il vient.
        $flat = [];
        foreach (array_values($words) as $rank => $word) {
            $key = CleDeQuartier::de((string) $word);
            if ($key === null) {
                break;
            }
            foreach (explode(' ', $key) as $sub) {
                $flat[] = [$sub, $rank];
            }
        }
        if ($flat === []) {
            return null;
        }

        foreach ($this->index[$flat[0][0]] ?? [] as $candidate) {
            $n = count($candidate['words']);
            if ($n > count($flat)) {
                continue;
            }
            for ($k = 0; $k < $n; $k++) {
                if ($flat[$k][0] !== $candidate['words'][$k]) {
                    continue 2;
                }
            }
            // Le lieu doit finir sur une fin de mot de la saisie.
            if (isset($flat[$n]) && $flat[$n][1] === $flat[$n - 1][1]) {
                continue;
            }

            return [
                'kind' => $candidate['kind'],
                'name' => $candidate['name'],
                'city' => $candidate['kind'] === 'city' ? null : $candidate['city'],
                'length' => $flat[$n - 1][1] + 1,
            ];
        }

        return null;
    }
}
