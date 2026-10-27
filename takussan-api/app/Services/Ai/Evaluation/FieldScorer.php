<?php

namespace App\Services\Ai\Evaluation;

/**
 * TCK-2384 (ADR-0076 §8) — l'exactitude d'une sortie, champ par champ, entre 0 et 1. Le type se
 * déclare dans `fields.json`, à défaut il se déduit de la valeur attendue : liste → recouvrement
 * (Jaccard, insensible à la casse) ; nombre → égalité à la tolérance relative près (0 par défaut) ;
 * le reste → égalité, les chaînes sans casse ni espaces de bord.
 */
final class FieldScorer
{
    /**
     * @param  array<string, mixed>  $expected
     * @param  array<string, mixed>  $actual
     * @param  array<string, array{type?: string, tolerance?: float}>  $fields
     * @return array<string, float>
     */
    public function score(array $expected, array $actual, array $fields = []): array
    {
        $scores = [];
        foreach ($expected as $field => $want) {
            $spec = $fields[$field] ?? [];
            $got = $actual[$field] ?? null;
            $type = $spec['type'] ?? match (true) {
                is_array($want) => 'list',
                is_int($want) || is_float($want) => 'number',
                default => 'exact',
            };
            $scores[$field] = match ($type) {
                'list' => $this->list((array) $want, is_array($got) ? $got : []),
                'number' => $this->number($want, $got, (float) ($spec['tolerance'] ?? 0)),
                default => $this->normalize($want) === $this->normalize($got) ? 1.0 : 0.0,
            };
        }

        return $scores;
    }

    private function number(mixed $want, mixed $got, float $tolerance): float
    {
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
        $want = array_unique(array_map($this->normalize(...), $want));
        $got = array_unique(array_map($this->normalize(...), $got));
        $union = array_unique([...$want, ...$got]);
        if ($union === []) {
            return 1.0;
        }

        return round(count(array_intersect($want, $got)) / count($union), 4);
    }

    private function normalize(mixed $value): mixed
    {
        return is_string($value) ? mb_strtolower(trim($value)) : $value;
    }
}
