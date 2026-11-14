<?php

namespace App\Services\Search;

use App\Models\GeoCity;
use App\Support\Search\CleDeQuartier;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2603 (ADR-0088, amendement du 2026-11-10, cinquième sortie) — ce que le départ de la publication dit au
 * propriétaire qui hésite : combien de recherches des {@see self::WINDOW_DAYS} derniers jours (aujourd'hui compris)
 * visent sa ville, lu dans le journal anonyme des recherches (`search_query_stats`).
 *
 * - **Un total de ville, et rien d'autre** : la forme rendue est `{city, searches_7d}`. Ni la saisie, ni le quartier, ni
 *   les autres critères d'une recherche, ni un compte de visiteurs.
 * - **Rien sous le seuil** `publish.demand_min_searches` (200, décidé par le porteur le 2026-11-10) : `null`.
 * - **Arrondi à la dizaine inférieure** ({@see self::arrondi()}) : le total exact ne sort pas.
 * - **Le lieu d'une recherche** est son critère `city` ou chacun des noms de `cities` (la liste à virgules du journal),
 *   rapproché d'une ville du référentiel par {@see CleDeQuartier} — son nom ou un ancien nom, comme le filtre de la
 *   liste ({@see VilleDuFiltre}). Une recherche qui nomme deux fois la même ville compte une fois pour elle ; une saisie
 *   qui ne nomme aucune ville du référentiel ne compte pour aucune. Le quartier (`location`) n'est pas une ville.
 * - **Sans ville demandée**, la plus recherchée parmi celles qui atteignent le seuil ; aucune : `publish.demand_default_city`,
 *   sans chiffre. Le journal sous le seuil ne départage rien.
 * - **Gardé une heure** : le référentiel et les totaux sont relus au plus une fois par heure, pour toutes les villes à la
 *   fois — une saisie d'appelant ne crée aucune entrée de cache.
 */
final class DemandeDePublication
{
    public const WINDOW_DAYS = 7;

    private const CLE_DE_CACHE = 'publish.demand.v1';

    private const DUREE_DU_CACHE_SECONDES = 3600;

    /** @var array{villes: array<string, list<array{id: int, name: string}>>, totaux: array<int, int>}|null */
    private ?array $releve = null;

    /**
     * La ville du référentiel que nomme une saisie (sans casse ni accent, nom actuel ou ancien) ; la plus ancienne des
     * homonymes. `null` si aucune.
     *
     * @return array{id: int, name: string}|null
     */
    public function ville(string $saisie): ?array
    {
        $cle = CleDeQuartier::de($saisie);

        return $cle === null ? null : ($this->releve()['villes'][$cle][0] ?? null);
    }

    /**
     * @param  array{id: int, name: string}|null  $ville  la ville demandée ; `null` : la plus recherchée
     * @return array{city: string, searches_7d: int|null}
     */
    public function pour(?array $ville): array
    {
        $seuil = max(1, (int) config('publish.demand_min_searches', 200));
        $totaux = $this->releve()['totaux'];
        // Sans ville demandée, seules les villes AU-DESSUS du seuil concourent : un classement tiré d'un journal sous le
        // seuil serait lui-même une sortie (la ville qu'une seule recherche suffit à nommer), que l'ADR ne permet pas.
        $ville ??= $this->laPlusRecherchee(array_filter($totaux, static fn (int $total): bool => $total >= $seuil));
        if ($ville === null) {
            return ['city' => (string) config('publish.demand_default_city', 'Dakar'), 'searches_7d' => null];
        }

        $total = $totaux[$ville['id']] ?? 0;

        return [
            'city' => $ville['name'],
            'searches_7d' => $total >= $seuil ? self::arrondi($total) : null,
        ];
    }

    /** ADR-0088 (cinquième sortie) — le total sort arrondi à la dizaine inférieure : 1 247 se lit 1 240. */
    public static function arrondi(int $total): int
    {
        return intdiv(max(0, $total), 10) * 10;
    }

    /**
     * @param  array<int, int>  $totaux
     * @return array{id: int, name: string}|null
     */
    private function laPlusRecherchee(array $totaux): ?array
    {
        if ($totaux === []) {
            return null;
        }
        $id = null;
        foreach ($totaux as $candidat => $total) {
            if ($id === null || $total > $totaux[$id] || ($total === $totaux[$id] && $candidat < $id)) {
                $id = $candidat;
            }
        }
        foreach ($this->releve()['villes'] as $homonymes) {
            foreach ($homonymes as $ville) {
                if ($ville['id'] === $id) {
                    return $ville;
                }
            }
        }

        return null;
    }

    /** @return array{villes: array<string, list<array{id: int, name: string}>>, totaux: array<int, int>} */
    private function releve(): array
    {
        return $this->releve ??= Cache::remember(
            self::CLE_DE_CACHE,
            self::DUREE_DU_CACHE_SECONDES,
            function (): array {
                $villes = $this->villesParCle();

                return ['villes' => $villes, 'totaux' => $this->totaux($villes)];
            },
        );
    }

    /**
     * Le référentiel, par clé de nom : le nom actuel et chacun des anciens noms ; les homonymes par identifiant croissant.
     *
     * @return array<string, list<array{id: int, name: string}>>
     */
    private function villesParCle(): array
    {
        $index = [];
        GeoCity::query()->orderBy('id')->get(['id', 'name', 'former_names'])->each(function (GeoCity $ville) use (&$index): void {
            $entree = ['id' => (int) $ville->id, 'name' => (string) $ville->name];
            $cles = [];
            foreach ([$ville->name, ...($ville->former_names ?? [])] as $nom) {
                $cle = CleDeQuartier::de(is_string($nom) ? $nom : null);
                if ($cle !== null) {
                    $cles[$cle] = true;
                }
            }
            foreach (array_keys($cles) as $cle) {
                $index[$cle][] = $entree;
            }
        });

        return $index;
    }

    /**
     * Les recherches de la fenêtre, par ville du référentiel : chaque ligne du journal compte une fois pour chaque ville
     * qu'elle nomme.
     *
     * @param  array<string, list<array{id: int, name: string}>>  $villes
     * @return array<int, int>
     */
    private function totaux(array $villes): array
    {
        $totaux = [];
        DB::table('search_query_stats')
            ->selectRaw("criteria->>'city' as city")
            ->selectRaw("criteria->>'cities' as cities")
            ->selectRaw('sum(searches_count) as searches')
            ->where('day', '>=', now()->subDays(self::WINDOW_DAYS - 1)->toDateString())
            ->whereRaw("(criteria->>'city' is not null or criteria->>'cities' is not null)")
            ->groupByRaw("criteria->>'city', criteria->>'cities'")
            ->get()
            ->each(function (object $ligne) use ($villes, &$totaux): void {
                $ids = [];
                foreach (self::noms($ligne->city, $ligne->cities) as $nom) {
                    foreach ($villes[(string) CleDeQuartier::de($nom)] ?? [] as $ville) {
                        $ids[$ville['id']] = true;
                    }
                }
                foreach (array_keys($ids) as $id) {
                    $totaux[$id] = ($totaux[$id] ?? 0) + (int) $ligne->searches;
                }
            });

        return $totaux;
    }

    /** @return list<string> les noms de ville d'une ligne : `city`, puis chacun de `cities` (chaîne à virgules, ou liste JSON) */
    private static function noms(mixed $ville, mixed $villes): array
    {
        $noms = is_string($ville) && $ville !== '' ? [$ville] : [];
        if (is_string($villes) && $villes !== '') {
            $liste = str_starts_with($villes, '[') ? json_decode($villes, true) : explode(',', $villes);
            foreach (is_array($liste) ? $liste : [] as $nom) {
                if (is_string($nom) && trim($nom) !== '') {
                    $noms[] = trim($nom);
                }
            }
        }

        return $noms;
    }
}
