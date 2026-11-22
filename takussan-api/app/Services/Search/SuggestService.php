<?php

namespace App\Services\Search;

use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Suggestion de la barre de recherche publique : les TYPES de bien (`property_types`).
 *
 * Décision du porteur du 2026-11-04 (revue de la recherche, 4a) : les groupes `cities` et `neighborhoods` (TCK-335 :
 * `facet-search` sur l'index des biens, puis un `/multi-search` de ventilation par ville — deux à trois appels moteur à
 * chaque frappe) ont quitté la réponse. Plus rien ne les lisait côté front : les lieux viennent de `places`, servis par
 * l'index des suggestions (`App\Services\Search\Suggestions\SearchSuggestions`, TCK-2474), qui garde la tolérance
 * à la faute, le couple (quartier, ville) et un compte égal à la liste (`SearchSuggestTest`).
 *
 * ⚠ `property_types` RESTE sur la base + `trans()`, et c'est MESURE (2026-08-21, base
 * locale, 258 biens publics) :
 *
 *     facet-search type facetQuery=appart -> [{"value":"apartment","count":63}]
 *     facet-search type facetQuery=maison -> []
 *
 * `type` est indexe par la valeur d'enum anglaise et `type_label` est
 * *searchable* mais pas *filterable*, donc pas facetable. Basculer ce groupe
 * sur le moteur rendrait des libelles anglais a un utilisateur francophone et
 * ne repondrait plus a « maison » — c'est-a-dire detruirait la localisation de
 * la suggestion. Le chemin par la base rend `maison -> Maison (23)` et
 * `appart -> Appartement (35)`, dans les trois langues.
 */
class SuggestService
{
    public function __construct(
        private readonly CacheRepository $cache,
    ) {}

    /**
     * @return array{property_types: list<array<string,mixed>>}
     */
    public function resolve(string $q, int $limit, string $locale): array
    {
        $q = trim($q);

        if ($q === '') {
            return ['property_types' => []];
        }

        return [
            'property_types' => $this->filterTypes($this->types($locale), $this->normalize($q), $limit),
        ];
    }

    /**
     * Types de bien — chemin par la base + `trans()`, cf. l'en-tete de la classe.
     *
     * @return list<array<string,mixed>>
     */
    private function types(string $locale): array
    {
        return $this->cache->remember(
            "search:suggest:types:{$locale}",
            300,
            fn (): array => $this->resolveTypes($locale),
        );
    }

    /** @return list<array<string,mixed>> */
    private function resolveTypes(string $locale): array
    {
        $counts = Property::query()
            ->public()
            ->groupBy('type')
            ->select('type', DB::raw('count(*) as count'))
            ->get()
            ->keyBy('type');

        return collect(PropertyType::cases())
            ->map(function (PropertyType $type) use ($counts, $locale): array {
                $count = isset($counts[$type->value]) ? (int) $counts[$type->value]->count : 0;
                $label = (string) trans("properties.type.{$type->value}", [], $locale);

                return [
                    'label' => $label,
                    'value' => $type->value,
                    'count' => $count,
                    'normalized_label' => $this->normalize($label),
                ];
            })
            ->filter(fn ($row) => $row['count'] > 0)
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    private function normalize(string $s): string
    {
        return Str::ascii(Str::lower(trim($s)));
    }

    /**
     * Types de bien — deux passes : le PRÉFIXE strict d'abord, la FAUTE ensuite (TCK-507).
     *
     * Le préfixe seul rendait « apprtement » → rien, pendant que `/search` — plein-texte
     * Meilisearch, deux fautes admises dès 9 caractères — rendait 34 biens. Le panneau concluait
     * alors « Aucun résultat » d'une liste de TERMES vide, au-dessus d'une liste d'annonces
     * pleine. La tolérance n'est pas un confort : c'est ce qui fait que la suggestion et la
     * recherche jugent une faute de la même façon.
     *
     * Les seuils sont ceux du moteur (`typoTolerance.minWordSizeForTypos`), cf.
     * {@see self::typoBudget()} — et la faute est jugée comme le moteur la juge, en PRÉFIXE :
     * « apprt » (5 caractères) est à une faute de « appar », pas à six de « appartement ».
     *
     * L'ordre est celui de la base (compte décroissant) au sein de chaque passe, et un type
     * atteint par le préfixe n'est jamais re-proposé par la faute.
     *
     * @param  list<array<string,mixed>>  $rows
     * @return list<array<string,mixed>>
     */
    private function filterTypes(array $rows, string $needle, int $limit): array
    {
        $budget = $this->typoBudget(mb_strlen($needle));

        $results = [];
        $seen = [];

        foreach ($rows as $row) {
            if (str_starts_with((string) $row['normalized_label'], $needle)) {
                $results[] = $this->withoutNormalized($row);
                $seen[(string) $row['value']] = true;
            }
        }

        if ($budget > 0) {
            foreach ($rows as $row) {
                if (isset($seen[(string) $row['value']])) {
                    continue;
                }
                if ($this->prefixDistance($needle, (string) $row['normalized_label'], $budget) <= $budget) {
                    $results[] = $this->withoutNormalized($row);
                }
            }
        }

        return array_slice($results, 0, $limit);
    }

    /**
     * Le nombre de fautes admis pour une saisie de `$length` caractères — les valeurs par
     * défaut de Meilisearch (`oneTypo = 5`, `twoTypos = 9`), que l'index n'a jamais
     * modifiées. ⚠ À faire bouger AVEC un éventuel réglage de l'index, jamais seul.
     */
    private function typoBudget(int $length): int
    {
        return match (true) {
            $length >= 9 => 2,
            $length >= 5 => 1,
            default => 0,
        };
    }

    /**
     * Distance de Levenshtein de la saisie au libellé, jugée en préfixe : le minimum entre le
     * libellé entier et ses préfixes de longueur `len ± budget`. Les deux chaînes sont
     * normalisées en ASCII par {@see self::normalize()}, ce qui rend `levenshtein()` — qui
     * compte des OCTETS — exact ici.
     */
    private function prefixDistance(string $needle, string $label, int $budget): int
    {
        $length = strlen($needle);
        $best = levenshtein($needle, $label);

        for ($cut = max(1, $length - $budget); $cut <= $length + $budget; $cut++) {
            if ($cut >= strlen($label)) {
                break;
            }
            $best = min($best, levenshtein($needle, substr($label, 0, $cut)));
        }

        return $best;
    }

    /**
     * @param  array<string,mixed>  $row
     * @return array<string,mixed>
     */
    private function withoutNormalized(array $row): array
    {
        unset($row['normalized_label']);

        return $row;
    }
}
