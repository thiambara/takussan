<?php

namespace App\Services\Search;

use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Laravel\Scout\EngineManager;
use Meilisearch\Contracts\SearchQuery;

/**
 * TCK-2498 — la répartition des prix des biens que la liste publique rendrait sous ces filtres (sans bornes de prix) :
 * l'histogramme du budget.
 *
 * - **Les filtres de la liste**, empruntés à {@see PropertySearchService::filtreDeLaListe()} (filtre public compris :
 *   ni brouillon, ni bien de test, ni bien non public) ; le mot-clé au régime conjonctif de la liste (`all`). Le repli
 *   élargi d'ADR-0024 n'est pas rejoué : sous un mot-clé qui rend 0, la répartition est vide.
 * - **Deux lectures moteur** : une requête sans document qui rend `facetStats.price` (le minimum, le maximum, le total),
 *   puis UN `/multi-search` d'une sonde par tranche (`hitsPerPage: 0`, `totalHits` exact). Pas la `facetDistribution`
 *   du prix : elle ne rend que `maxValuesPerFacet` valeurs distinctes (100), et ses comptes seraient tronqués en silence.
 * - **Les tranches** : au plus {@see self::TRANCHES_MAX}, d'une largeur « ronde » (1, 2 ou 5 × 10ⁿ, au moins 1 000 F),
 *   alignées sur un multiple de cette largeur, `[from, to)`. Elles couvrent le minimum et le maximum : la somme des
 *   `count` égale le `meta.total` de la liste sous les mêmes filtres (un prix est toujours renseigné, `price` NOT NULL).
 * - **Le prix est celui que filtre la liste**, sans conversion : la liste compare `price` tel quel, et `rent_period` est
 *   un filtre à part. Un histogramme ramené au mois mènerait à des bornes `price_min`/`price_max` que la liste lirait
 *   autrement. **En location, un loyer s'entend par mois** (ticket) : sans `rent_period`, l'histogramme ne prend que
 *   le loyer AU MOIS, implicite (`rent_period` nul) ou déclaré (`monthly`) — {@see self::PERIODES_HORS_MOIS} n'y entrent
 *   pas, et le front n'a pas à s'en souvenir. ⚠ Pas `rent_period = monthly` : en développement, 519 locations sur 641
 *   n'ont pas de période (écrites hors du modèle, que l'événement `saving` met sinon à `monthly`) ; les exclure rendait
 *   46 biens à l'histogramme contre 172 à la liste. Un `rent_period` explicite est respecté.
 * - **En cache** {@see self::TTL} secondes par jeu de filtres normalisé (clés triées). `agency`/`agent` sont résolus
 *   AVANT la clé ({@see ProfilDuFiltre}) : l'identifiant résolu y entre, et un profil hors ligne rend vide sur-le-champ —
 *   sans quoi une agence suspendue gardait sa répartition jusqu'à la fin du TTL, quand la liste rendait déjà 0.
 */
final class RepartitionDesPrix
{
    public const TRANCHES_MAX = 20;

    /** Au plus une heure (ticket) : une répartition un peu en retard reste juste à l'échelle d'un histogramme. */
    public const TTL = 900;

    private const LARGEUR_MIN = 1000;

    private const VIDE = ['buckets' => [], 'min' => null, 'max' => null];

    /** Les périodes qui ne sont pas un loyer au mois : hors de l'histogramme d'une location sans `rent_period`. */
    public const PERIODES_HORS_MOIS = [RentPeriod::Daily, RentPeriod::Weekly, RentPeriod::Yearly];

    public function __construct(
        private readonly PropertySearchService $recherche,
        private readonly CacheRepository $cache,
        private readonly ProfilDuFiltre $profils,
    ) {}

    /**
     * @param  array<string, mixed>  $params  les paramètres validés (`PriceDistributionRequest`)
     * @return array{buckets: list<array{from: int, to: int, count: int}>, min: float|int|null, max: float|int|null}
     */
    public function calculer(array $params): array
    {
        $params = array_filter($params, static fn (mixed $v): bool => $v !== null && $v !== '' && $v !== []);
        $auMois = ($params['contract_type'] ?? null) === 'rent' && ! isset($params['rent_period']);
        ksort($params);

        $profils = [];
        foreach (['agency' => $this->profils->agence(...), 'agent' => $this->profils->agent(...)] as $cle => $resoudre) {
            if (isset($params[$cle]) && is_string($params[$cle])) {
                $profils[$cle] = $resoudre($params[$cle]) ?? 'aucun';
            }
        }
        if (in_array('aucun', $profils, true)) {
            return self::VIDE;
        }

        return $this->cache->remember(
            'search:price-distribution:'.sha1((string) json_encode([$params, $profils, $auMois])),
            self::TTL,
            fn (): array => $this->calculerSansCache($params, $auMois),
        );
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{buckets: list<array{from: int, to: int, count: int}>, min: float|int|null, max: float|int|null}
     */
    private function calculerSansCache(array $params, bool $auMois): array
    {
        $terme = trim((string) ($params['q'] ?? $params['search'] ?? ''));
        $filtre = $this->recherche->filtreDeLaListe($params);
        if ($auMois) {
            // `NOT … IN` et non `IS NULL OR = monthly` : il garde aussi un document où l'attribut manque.
            $filtre[] = 'NOT rent_period IN ['.implode(', ', array_map(
                static fn (RentPeriod $periode): string => "'".$periode->value."'",
                self::PERIODES_HORS_MOIS,
            )).']';
        }
        $uid = (new Property)->searchableAs();

        $stats = $this->multiSearch([(new SearchQuery)->setIndexUid($uid)->setQuery($terme)->setFilter($filtre)
            ->setMatchingStrategy('all')->setFacets(['price'])->setPage(1)->setHitsPerPage(0)])[0] ?? [];
        $min = $stats['facetStats']['price']['min'] ?? null;
        $max = $stats['facetStats']['price']['max'] ?? null;
        if ((int) ($stats['totalHits'] ?? 0) === 0 || ! is_numeric($min) || ! is_numeric($max)) {
            return self::VIDE;
        }

        [$debut, $largeur, $nombre] = self::tranches((float) $min, (float) $max);
        $sondes = [];
        for ($i = 0; $i < $nombre; $i++) {
            $sondes[] = (new SearchQuery)->setIndexUid($uid)->setQuery($terme)
                ->setFilter([...$filtre, 'price >= '.($debut + $i * $largeur), 'price < '.($debut + ($i + 1) * $largeur)])
                ->setMatchingStrategy('all')->setPage(1)->setHitsPerPage(0);
        }
        $resultats = $this->multiSearch($sondes);

        $buckets = [];
        for ($i = 0; $i < $nombre; $i++) {
            $buckets[] = [
                'from' => $debut + $i * $largeur,
                'to' => $debut + ($i + 1) * $largeur,
                'count' => (int) ($resultats[$i]['totalHits'] ?? 0),
            ];
        }

        return ['buckets' => $buckets, 'min' => self::nombre($min), 'max' => self::nombre($max)];
    }

    /**
     * La plus petite largeur « ronde » (1, 2, 5 × 10ⁿ, au moins {@see self::LARGEUR_MIN}) qui couvre `[min, max]` en au
     * plus {@see self::TRANCHES_MAX} tranches alignées sur ses multiples.
     *
     * @return array{0: int, 1: int, 2: int} début, largeur, nombre de tranches
     */
    public static function tranches(float $min, float $max): array
    {
        for ($puissance = self::LARGEUR_MIN; ; $puissance *= 10) {
            foreach ([1, 2, 5] as $facteur) {
                $largeur = $facteur * $puissance;
                $premier = (int) floor($min / $largeur);
                $nombre = (int) floor($max / $largeur) - $premier + 1;
                if ($nombre <= self::TRANCHES_MAX) {
                    return [$premier * $largeur, $largeur, $nombre];
                }
            }
        }
    }

    private static function nombre(mixed $valeur): float|int
    {
        $nombre = (float) $valeur;

        return floor($nombre) === $nombre ? (int) $nombre : $nombre;
    }

    /**
     * Le moteur CONFIGURÉ (même préfixe d'index que Scout, y compris celui des tests) — le motif de
     * `PropertySearchService::widen()`.
     *
     * @param  list<SearchQuery>  $queries
     * @return list<array<string, mixed>>
     */
    private function multiSearch(array $queries): array
    {
        /** @var array{results?: list<array<string, mixed>>} $response */
        $response = app(EngineManager::class)->engine()->multiSearch($queries);

        return $response['results'] ?? [];
    }
}
