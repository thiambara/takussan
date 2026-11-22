<?php

namespace App\Services\Boost;

use Carbon\CarbonInterface;

/**
 * TCK-633 lot F (ADR-0061 §7) — la rotation des emplacements « Sponsorisé ». Pure : aucune lecture,
 * aucune écriture. La graine est faite des filtres NORMALISÉS (sans `page` ni `per_page`, sans
 * valeur vide, clés et listes triées) et de l'heure UTC : deux visiteurs voient la même chose dans
 * la même heure. Le vivier est mélangé par un hachage de (graine, id), et la page p en prend la
 * tranche p, en bouclant.
 */
final class SponsoredRotation
{
    /** Le vivier ne dépasse pas ce nombre de vedettes (dans l'ordre organique). */
    public const POOL_CAP = 200;

    /** @param  array<string, mixed>  $params */
    public static function seed(array $params, ?CarbonInterface $at = null): string
    {
        unset($params['page'], $params['per_page']);

        return hash('sha256', json_encode(self::normalize($params), JSON_UNESCAPED_UNICODE)
            .'|'.($at ?? now())->copy()->utc()->format('Y-m-d-H'));
    }

    /**
     * @param  list<int>  $ids
     * @return list<int>
     */
    public static function pick(array $ids, string $seed, int $page, int $slots): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if ($slots <= 0 || $ids === []) {
            return [];
        }
        usort($ids, fn (int $a, int $b) => strcmp(hash('sha256', $seed.':'.$a), hash('sha256', $seed.':'.$b)) ?: $a <=> $b);

        $count = count($ids);
        $take = min($slots, $count);
        $start = ((max(1, $page) - 1) * $slots) % $count;
        $picked = [];
        for ($i = 0; $i < $take; $i++) {
            $picked[] = $ids[($start + $i) % $count];
        }

        return $picked;
    }

    /**
     * TCK-2500 — la tranche de {@see self::pick()} pour la page `$page`, les biens de `$exclus` SAUTÉS (le suivant dans le
     * même ordre prend leur place), au plus `$take` biens. Même mélange, même début de tranche : sans exclusion et pour
     * `$take = $slots`, le résultat est celui de `pick()` — la rotation et la graine ne changent pas.
     *
     * @param  list<int>  $ids
     * @param  list<int>  $exclus
     * @return list<int>
     */
    public static function pickExcluding(array $ids, string $seed, int $page, int $slots, array $exclus, int $take): array
    {
        $ordre = self::pick($ids, $seed, 1, count(array_unique(array_map('intval', $ids))));
        $count = count($ordre);
        if ($slots <= 0 || $take <= 0 || $count === 0) {
            return [];
        }
        // `pick(…, 1, $count)` rend le mélange entier à partir de son premier élément : la tranche de la page `$page`
        // commence au même rang que dans `pick($ids, $seed, $page, $slots)`.
        $start = ((max(1, $page) - 1) * $slots) % $count;
        $exclus = array_flip(array_map('intval', $exclus));

        $picked = [];
        for ($i = 0; $i < $count && count($picked) < $take; $i++) {
            $id = $ordre[($start + $i) % $count];
            if (! isset($exclus[$id])) {
                $picked[] = $id;
            }
        }

        return $picked;
    }

    private static function normalize(mixed $value): mixed
    {
        if (! is_array($value)) {
            return is_string($value) ? trim($value) : $value;
        }
        $clean = [];
        foreach ($value as $key => $item) {
            $item = self::normalize($item);
            if ($item === null || $item === '' || $item === []) {
                continue;
            }
            $clean[$key] = $item;
        }
        if (array_is_list($clean)) {
            sort($clean);

            return $clean;
        }
        ksort($clean);

        return $clean;
    }
}
