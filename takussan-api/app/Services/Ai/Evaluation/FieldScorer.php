<?php

namespace App\Services\Ai\Evaluation;

/**
 * TCK-2384 (ADR-0076 §8) — l'exactitude d'une sortie, champ par champ, entre 0 et 1. Le type se
 * déclare dans `fields.json`, à défaut il se déduit de la valeur attendue : liste → recouvrement
 * (Jaccard, insensible à la casse) ; nombre → égalité à la tolérance relative près (0 par défaut) ;
 * le reste → égalité, les chaînes sans casse ni espaces de bord.
 *
 * TCK-2386 — `path` (notation pointée de `data_get`) désigne dans la sortie ce qu'un attendu compare,
 * quand la sortie enveloppe chaque valeur (`{"price": {"value": …, "confidence": …}}` →
 * `"path": "price.value"`) ; à défaut, la clé de l'attendu. Un nombre attendu nul n'est juste que
 * face à une sortie nulle : ne pas inventer une surface absente se note, comme l'inventer.
 * `text` compare comme `exact` mais sans AUCUN blanc (espaces, insécables) : un prix recopié
 * « 450.000 f / mois » vaut « 450.000f/mois » ; la ponctuation, elle, compte.
 */
final class FieldScorer
{
    /**
     * @param  array<string, mixed>  $expected
     * @param  array<string, mixed>  $actual
     * @param  array<string, array{type?: string, tolerance?: float, path?: string}>  $fields
     * @return array<string, float>
     */
    public function score(array $expected, array $actual, array $fields = []): array
    {
        $scores = [];
        foreach ($expected as $field => $want) {
            $spec = $fields[$field] ?? [];
            $got = isset($spec['path']) ? data_get($actual, (string) $spec['path']) : ($actual[$field] ?? null);
            $type = $spec['type'] ?? match (true) {
                is_array($want) => 'list',
                is_int($want) || is_float($want) => 'number',
                default => 'exact',
            };
            $scores[$field] = match ($type) {
                'list' => $this->list((array) $want, is_array($got) ? $got : []),
                'number' => $this->number($want, $got, (float) ($spec['tolerance'] ?? 0)),
                'text' => $this->withoutBlanks($want) === $this->withoutBlanks($got) ? 1.0 : 0.0,
                default => $this->normalize($want) === $this->normalize($got) ? 1.0 : 0.0,
            };
        }

        return $scores;
    }

    private function number(mixed $want, mixed $got, float $tolerance): float
    {
        if ($want === null) {
            return $got === null ? 1.0 : 0.0;
        }
        if (! is_numeric($want) || ! is_numeric($got)) {
            return 0.0;
        }
        if ((float) $want === 0.0) {
            return (float) $got === 0.0 ? 1.0 : 0.0;
        }

        return abs((float) $got - (float) $want) / abs((float) $want) <= $tolerance ? 1.0 : 0.0;
    }

    /** @param  list<mixed>  $want  @param  list<mixed>  $got */
    private function list(array $want, array $got): float
    {
        $want = array_unique(array_map($this->element(...), $want));
        $got = array_unique(array_map($this->element(...), $got));
        $union = array_unique([...$want, ...$got]);
        if ($union === []) {
            return 1.0;
        }

        return round(count(array_intersect($want, $got)) / count($union), 4);
    }

    /**
     * La clé de comparaison d'un élément de liste : une chaîne, qu'il soit scalaire ou structuré.
     * Un objet ou une sous-liste devient son JSON canonique (clés triées, chaînes normalisées), de
     * sorte que l'ordre des clés ne compte pas ; `array_unique` et `array_intersect` ne savent pas
     * comparer des tableaux (« Array to string conversion »).
     */
    private function element(mixed $value): string
    {
        if (is_array($value)) {
            return "\0".json_encode($this->canonical($value), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
        }

        return (string) $this->normalize($value);
    }

    private function canonical(mixed $value): mixed
    {
        if (! is_array($value)) {
            return is_string($value) ? mb_strtolower(trim($value)) : $value;
        }
        $value = array_map($this->canonical(...), $value);
        if (! array_is_list($value)) {
            ksort($value);
        }

        return $value;
    }

    private function withoutBlanks(mixed $value): mixed
    {
        return is_string($value) ? (string) preg_replace('/[\s\x{00A0}\x{202F}]+/u', '', mb_strtolower($value)) : $value;
    }

    private function normalize(mixed $value): mixed
    {
        return is_string($value) ? mb_strtolower(trim($value)) : $value;
    }
}
