<?php

namespace App\Support;

/**
 * TCK-2488 — retire les règles d'élément (`x.*`, `x.*.y`) d'une liste que son parent refuse d'office.
 *
 * Laravel joue les règles d'élément sur CHAQUE élément reçu, même quand le parent a déjà échoué sur
 * sa borne : 20 000 éléments coûtaient 29 s de CPU et 2 Mo de 422 (revue de TCK-2483, M1). Une règle
 * n'est retirée que si le parent ÉCHOUE DE TOUTE FAÇON — la réponse reste un 422, porté par le parent
 * seul, et un corps valide garde toutes ses règles. Trois refus d'office, lus dans les règles du
 * parent :
 *
 *  - `array` (ou `array:…`, ou `list`) et `max:N`, reçu avec plus de N éléments ;
 *  - `array:k1,…,kN`, reçu avec une clé hors de la liste ;
 *  - `prohibited`, reçu non vide.
 *
 * Un parent qui porte un `exclude*` n'est pas jugé ici : il peut ne pas être jugé du tout.
 *
 * Une clé à plusieurs `.*` est jugée sur chacun de ses préfixes (`a.*.b.*.c` → `a`, `a.*.b`). Pour un
 * préfixe lui-même générique, une seule instance refusée suffit : la requête échoue sur elle.
 *
 * Appelée par `Concerns\BorneLesReglesDElement` (les FormRequest), sur les données que le validateur
 * recevra.
 */
final class ReglesDElementBornees
{
    /**
     * @param  array<string, mixed>  $rules
     * @param  array<array-key, mixed>  $data
     * @return array<string, mixed>
     */
    public static function retirer(array $rules, array $data): array
    {
        $refus = [];

        foreach (array_keys($rules) as $key) {
            $key = (string) $key;
            foreach (self::prefixes($key) as $parent) {
                $refus[$parent] ??= array_key_exists($parent, $rules)
                    && self::refuseUneInstance($rules[$parent], $parent, $data);

                if ($refus[$parent]) {
                    unset($rules[$key]);

                    break;
                }
            }
        }

        return $rules;
    }

    /**
     * Les parents génériques d'une clé : ce qui précède chacun de ses `.*`.
     *
     * @return list<string>
     */
    private static function prefixes(string $key): array
    {
        $prefixes = [];
        $offset = 0;
        while (($pos = strpos($key, '.*', $offset)) !== false) {
            // `.*` doit fermer un segment : `a.*b` n'est pas un générique.
            if ($pos + 2 === strlen($key) || $key[$pos + 2] === '.') {
                $prefixes[] = substr($key, 0, $pos);
            }
            $offset = $pos + 2;
        }

        return $prefixes;
    }

    /** @param  array<array-key, mixed>  $data */
    private static function refuseUneInstance(mixed $parentRules, string $parent, array $data): bool
    {
        $refus = self::refusDOffice($parentRules);
        if ($refus === null) {
            return false;
        }

        foreach (self::instances($data, explode('.', $parent)) as $value) {
            if (is_array($value) && $refus($value)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Le prédicat « ce tableau est refusé par le parent », ou `null` si ses règles n'en promettent aucun.
     *
     * @return (\Closure(array<array-key, mixed>): bool)|null
     */
    private static function refusDOffice(mixed $parentRules): ?\Closure
    {
        $rules = is_string($parentRules) ? explode('|', $parentRules) : (is_array($parentRules) ? $parentRules : [$parentRules]);
        $rules = array_values(array_filter($rules, 'is_string'));

        $estTableau = false;
        $max = null;
        $cles = null;
        $interdit = false;
        foreach ($rules as $rule) {
            if (str_starts_with($rule, 'exclude')) {
                return null;
            }
            if ($rule === 'array' || $rule === 'list') {
                $estTableau = true;
            } elseif (str_starts_with($rule, 'array:')) {
                $estTableau = true;
                $cles = array_map('trim', explode(',', substr($rule, 6)));
            } elseif (str_starts_with($rule, 'max:') && is_numeric(substr($rule, 4))) {
                $max = min($max ?? PHP_INT_MAX, (int) substr($rule, 4));
            } elseif ($rule === 'prohibited') {
                $interdit = true;
            }
        }

        $predicats = [];
        if ($estTableau && $max !== null) {
            $predicats[] = static fn (array $value): bool => count($value) > $max;
        }
        if ($cles !== null) {
            $predicats[] = static fn (array $value): bool => array_diff(array_map('strval', array_keys($value)), $cles) !== [];
        }
        if ($interdit) {
            $predicats[] = static fn (array $value): bool => $value !== [];
        }

        if ($predicats === []) {
            return null;
        }

        return static function (array $value) use ($predicats): bool {
            foreach ($predicats as $predicat) {
                if ($predicat($value)) {
                    return true;
                }
            }

            return false;
        };
    }

    /**
     * Les valeurs reçues au chemin `$segments`, un `*` parcourant chaque élément.
     *
     * @param  list<string>  $segments
     * @return list<mixed>
     */
    private static function instances(mixed $data, array $segments): array
    {
        if ($segments === []) {
            return [$data];
        }
        if (! is_array($data)) {
            return [];
        }

        $segment = array_shift($segments);
        if ($segment === '*') {
            $found = [];
            foreach ($data as $value) {
                array_push($found, ...self::instances($value, $segments));
            }

            return $found;
        }

        return array_key_exists($segment, $data) ? self::instances($data[$segment], $segments) : [];
    }
}
