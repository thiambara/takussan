<?php

namespace App\Services\Search;

use App\Http\Resources\PropertyResource;
use App\Http\Responses\PaginationMeta;
use App\Models\Property;
use App\Services\Boost\BoostSettings;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Boost\SponsoredRotation;
use App\Support\Search\CleDeQuartier;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Laravel\Scout\EngineManager;
use Meilisearch\Contracts\SearchQuery;

/**
 * Public property search, backed by Meilisearch (TCK-280).
 *
 * Issues a single Meilisearch query — filters, geo and sort are all
 * pushed into the engine — so `meta.total` is the exact filtered count and no
 * post-engine filtering is needed. Returns the `{data, sponsored, meta, search}`
 * contract expected by `GET /api/public/properties/search`.
 *
 * ── DEUX RÉGIMES (TCK-338, {@see docs/adr/0024-recherche-publique-conjonctive-avec-repli-nomme.md}) ──
 *
 * 1. NOMINAL — `matchingStrategy: 'all'` : un bien ne sort que s'il porte TOUS
 *    les termes utiles. Une requête, comme avant.
 * 2. REPLI — quand le nominal rend 0 ET que la requête porte ≥ 2 termes utiles :
 *    UN SEUL `/multi-search` rejoue la requête en `last` et SONDE chaque terme
 *    seul. La réponse porte alors `search.strategy = 'widened'` et nomme les
 *    termes dont la sonde solo rend 0.
 *
 * Mesuré le 2026-08-21 (base locale, 258 biens publics), et c'est le défaut qui
 * a ouvert le ticket : sous le défaut `last` de Meilisearch, `q=villa Saly`
 * rendait EXACTEMENT les 63 mêmes ids que `q=villa`, dans le même ordre — le
 * moteur retire les termes qui ne matchent pas au lieu d'exclure les documents.
 * Sous `all` : 0, et `villa Dakar` rend 47, c'est-à-dire exactement ce que rend
 * `q=villa&city=Dakar` (6 couples comparés, 6 coïncidences).
 *
 * ⚠ Le repli n'est PAS un ornement. `all` est brutal sur un catalogue mince :
 * 30 couples (type × ville) sur 60 tombent à 0, et une faute sur un mot court
 * (`villa dakr`) fait 63 → 0 sans dégradation, `dakr` étant sous le seuil
 * `typoTolerance.minWordSizeForTypos.oneTypo = 5`. Retirer le repli en gardant
 * `all` serait une régression produit.
 */
class PropertySearchService
{
    /** Régime nominal : le document doit porter TOUS les termes. */
    private const STRATEGY_STRICT = 'all';

    /** Régime de repli : Meilisearch relâche les termes par la fin. */
    private const STRATEGY_WIDENED = 'last';

    /**
     * TCK-628 — la taille de page quand l'appelant n'en demande pas : la MÊME que celle de la liste
     * publique (`PER_PAGE_PAR_DEFAUT`, `takussan-web/src/lib/recherche-publique.ts`). Elle valait 20
     * quand la grille en attendait 30 ; le front envoie toujours la sienne, mais un appelant qui
     * l'omettrait recevait une autre page que celle de la liste.
     */
    public const PER_PAGE_PAR_DEFAUT = 40;

    /** TCK-1008 (P55.01) — la forme de `seed_hour`, en UTC : `2026-10-19T16`. */
    public const FORMAT_HEURE_DE_GRAINE = 'Y-m-d\\TH';

    /**
     * Plafond de sondes par requête.
     *
     * Une sonde par terme utile, dans le MÊME `/multi-search` que la requête
     * élargie — mesuré 6 à 30 ms pour 2 à 4 termes. Le plafond borne le coût
     * d'une requête pathologique (une phrase entière collée dans la barre) ; les
     * termes au-delà ne sont pas sondés, donc jamais nommés. C'est le sens
     * exact de la règle : on ne nomme pas un terme qu'on n'a pas sondé.
     */
    private const MAX_PROBES = 8;

    /**
     * @param  array<string,mixed>  $params
     * @return array{data:array<int,mixed>,sponsored:list<array<string,mixed>>,meta:array<string,int>,search:array{strategy:string,terms_unmatched:list<string>,widened_total:int|null}}
     */
    public function search(array $params): array
    {
        $term = trim((string) ($params['q'] ?? $params['search'] ?? ''));
        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($params['per_page'] ?? self::PER_PAGE_PAR_DEFAUT)));

        $filter = $this->buildFilter($params);
        $sort = $this->buildSort((string) ($params['sort'] ?? 'relevance'), $term, $params);

        // Scout unwraps a callback's SearchResult via getRaw(), so raw() here
        // yields the raw Meilisearch response array (hits/totalHits/etc.).
        /** @var array<string,mixed> $result */
        $result = Property::search($term, function ($index, string $query) use ($filter, $sort, $page, $perPage) {
            $searchParams = [
                'filter' => $filter,
                'page' => $page,
                'hitsPerPage' => $perPage,
                // TCK-984 (P55.03) — `hydrate()` ne lit que `id` et recharge tout depuis la base.
                'attributesToRetrieve' => ['id'],
                // TCK-338 — LA ligne de la décision. Paramètre de REQUÊTE, pas
                // réglage d'index : sa portée s'arrête à cet appelant, et la
                // révoquer ne demande aucune réindexation. C'est aussi ce qui la
                // rend facile à défaire par accident — chaque test qui en dépend
                // a donc été vérifié par ablation de cette ligne précise.
                'matchingStrategy' => self::STRATEGY_STRICT,
            ];

            if ($sort !== []) {
                $searchParams['sort'] = $sort;
            }

            return $index->search($query, $searchParams);
        })->raw();

        $search = [
            'strategy' => self::STRATEGY_STRICT,
            'terms_unmatched' => [],
            'widened_total' => null,
        ];

        // Le repli ne coûte QUE sur une requête qui rend 0 : le chemin nominal
        // reste à une seule requête moteur.
        $useful = $this->usefulTerms($term);

        if ((int) ($result['totalHits'] ?? 0) === 0 && count($useful) >= 2) {
            $widened = $this->widen($term, $useful, $filter, $sort, $page, $perPage);

            if ($widened !== null) {
                [$result, $unmatched] = $widened;
                $search = [
                    'strategy' => 'widened',
                    'terms_unmatched' => $unmatched,
                    // Écho de `meta.total`, par construction : `data` et `meta`
                    // décrivent TOUS DEUX le résultat élargi. Ce champ
                    // existe pour que le message du front ne dépende pas de la
                    // lecture de la pagination, jamais pour porter un compte que
                    // `meta` contredirait.
                    'widened_total' => (int) ($result['totalHits'] ?? 0),
                ];
            }
        }

        // TCK-633 lot F (ADR-0061 §7) — emplacements « Sponsorisé » et places réservées. Rien en
        // recherche ÉLARGIE : le vivier suit le régime strict, qui vient d'y rendre zéro.
        // TCK-687 (P18.01) — rien non plus quand l'appelant les coupe (`placements=false`) : il ne
        // les affiche pas, et une impression ne se compte que pour un emplacement montré.
        $avecEmplacements = filter_var($params['placements'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? true;
        // Hors de la graine de rotation : `placements=true` doit servir la même rotation que l'absence.
        unset($params['placements']);
        $heureDeGraine = $this->heureDeGraine($params['seed_hour'] ?? null);
        unset($params['seed_hour']);
        [$data, $sponsored] = $search['strategy'] === self::STRATEGY_STRICT && $avecEmplacements
            ? $this->placements($term, $filter, $sort, $page, $perPage, $params, $result, $heureDeGraine)
            : [$this->withPlacement($this->hydrate($result['hits'] ?? []), 'organic'), []];

        return [
            'data' => $data,
            'sponsored' => $sponsored,
            // Meilisearch ne rend pas un paginateur Eloquent : c'est le seul appelant de
            // `PaginationMeta::of()`, l'entrée par compteurs bruts du point canonique (TCK-304).
            'meta' => PaginationMeta::of(
                total: (int) ($result['totalHits'] ?? 0),
                perPage: $perPage,
                currentPage: $page,
                lastPage: max(1, (int) ($result['totalPages'] ?? 1)),
            ),
            'search' => $search,
            // TCK-1008 (P55.01) — l'heure de la graine de rotation, que le front renvoie avec les
            // pages suivantes (`seed_hour`) pour qu'elles complètent celle-ci.
            'seed_hour' => $heureDeGraine->format(self::FORMAT_HEURE_DE_GRAINE),
        ];
    }

    /**
     * TCK-1008 (P55.01) — l'heure UTC de la graine de rotation (ADR-0061 §7).
     *
     * Les places réservées de la page 1 se recalculent à chaque page, et la graine porte l'heure :
     * une page 2 servie après le changement d'heure excluait d'autres biens que ceux que la page 1
     * avait montrés en tête (un doublon, un absent). Le front renvoie donc avec les pages suivantes
     * l'heure de la page 1, qui n'est acceptée que si elle vaut l'heure courante ou la précédente :
     * au-delà (lien partagé, onglet oublié), c'est l'heure courante, comme avant.
     */
    private function heureDeGraine(mixed $demandee): CarbonImmutable
    {
        $courante = now()->utc()->startOfHour()->toImmutable();
        if (! is_string($demandee) || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}$/', $demandee) !== 1) {
            return $courante;
        }
        $heure = CarbonImmutable::createFromFormat('!'.self::FORMAT_HEURE_DE_GRAINE, $demandee, 'UTC');
        if (! $heure instanceof CarbonImmutable || $heure->format(self::FORMAT_HEURE_DE_GRAINE) !== $demandee) {
            return $courante;
        }

        return $heure->equalTo($courante) || $heure->equalTo($courante->subHour()) ? $heure : $courante;
    }

    /**
     * TCK-599 (ADR-0050 §1) — ce qu'une alerte de recherche rend : les biens que `/properties`
     * aurait rendus pour ces critères, publiés dans la fenêtre `]$apres, $jusqua]`.
     *
     * - **Le même filtre** que la liste (`buildFilter()`, donc `publicFilter()`), et le régime
     *   conjonctif SEUL : jamais le repli d'ADR-0024 — une alerte qui relâche un critère prévient
     *   d'un bien que la personne n'a pas demandé.
     * - **La fenêtre est dans le moteur** (`published_at`, timestamp filtrable) : filtrer après
     *   coup paginerait puis jetterait (la raison écrite par TCK-350). Les bornes sont des
     *   ARGUMENTS, jamais des clés de `criteria`.
     * - `totalHits` est le total annoncé ; seuls les `$limit` premiers sont rechargés, par
     *   `Property::public()` au moment de l'envoi — un bien sorti du public entre l'indexation et
     *   l'envoi n'est jamais décrit (il reste compté : le total est celui du moteur).
     *
     * @param  array<string,mixed>  $params  la forme de `SavedSearchCriteria::toSearchParams()`
     * @return array{properties: Collection<int,Property>, total: int}
     */
    public function alertMatches(array $params, ?DateTimeInterface $apres, DateTimeInterface $jusqua, int $limit = 5): array
    {
        $term = trim((string) ($params['q'] ?? ''));
        $filter = $this->buildFilter($params);
        if ($apres !== null) {
            $filter[] = 'published_at > '.$apres->getTimestamp();
        }
        $filter[] = 'published_at <= '.$jusqua->getTimestamp();

        /** @var array<string,mixed> $result */
        $result = Property::search($term, function ($index, string $query) use ($filter, $limit) {
            return $index->search($query, [
                'filter' => $filter,
                'page' => 1,
                'hitsPerPage' => $limit,
                'sort' => ['published_at:desc'],
                // ADR-0050 §1 — le régime nominal, et lui seul.
                'matchingStrategy' => self::STRATEGY_STRICT,
            ]);
        })->raw();

        $ids = array_map(static fn (array $hit): int => (int) $hit['id'], $result['hits'] ?? []);
        $loaded = $ids === [] ? collect() : Property::query()
            ->public()
            ->with('address', 'media')
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        return [
            'properties' => new Collection(
                collect($ids)->map(fn (int $id) => $loaded->get($id))->filter()->values()->all(),
            ),
            'total' => (int) ($result['totalHits'] ?? 0),
        ];
    }

    /**
     * Le repli, en UN SEUL aller-retour : la requête élargie ET les sondes.
     *
     * Position 0 du `/multi-search` : la requête complète rejouée en `last`,
     * avec la MÊME pagination, le MÊME tri et le MÊME filtre
     * que le régime nominal — c'est elle qui devient `data`/`meta`.
     * Positions 1..n : une sonde par terme utile, `all`, `hitsPerPage: 0` (le
     * moteur rend `totalHits` sans rendre un seul document).
     *
     * ⚠ Les sondes portent le filtre STRUCTURÉ de la requête, pas seulement le
     * filtre public. Sous `filter[city]=Dakar`, « aucun bien ne correspond à
     * *Saly* » parle du catalogue de Dakar — celui que l'utilisateur regarde.
     * Une sonde jouée hors contexte rendrait une phrase vraie ailleurs.
     *
     * ⚠⚠ Ce que Meilisearch NE PERMET PAS, et qui a fait réécrire la
     * prescription du ticket : le moteur ne rend nulle part les termes qu'il a
     * relâchés, et sous `last` il n'existe pas d'ensemble global — seul le
     * PREMIER terme est obligatoire, document par document. La seule chose
     * calculable, donc la seule qu'on affirme, est « ce terme, seul, ne rend
     * rien ».
     *
     * @param  list<string>  $useful
     * @param  array<int,string|array<int,string>>  $filter
     * @param  array<int,string>  $sort
     * @return array{0:array<string,mixed>,1:list<string>}|null null si le moteur n'a pas
     *                                                          rendu le compte de réponses
     *                                                          attendu : on garde alors la
     *                                                          réponse conjonctive plutôt que
     *                                                          d'inventer un repli.
     */
    private function widen(string $term, array $useful, array $filter, array $sort, int $page, int $perPage): ?array
    {
        $uid = (new Property)->searchableAs();
        $probed = array_slice($useful, 0, self::MAX_PROBES);

        $widened = (new SearchQuery)
            ->setIndexUid($uid)
            ->setQuery($term)
            ->setMatchingStrategy(self::STRATEGY_WIDENED)
            ->setFilter($filter)
            ->setAttributesToRetrieve(['id'])
            ->setPage($page)
            ->setHitsPerPage($perPage);

        if ($sort !== []) {
            $widened->setSort($sort);
        }

        $queries = [$widened];

        foreach ($probed as $mot) {
            $queries[] = (new SearchQuery)
                ->setIndexUid($uid)
                ->setQuery($mot)
                ->setMatchingStrategy(self::STRATEGY_STRICT)
                ->setFilter($filter)
                ->setPage(1)
                ->setHitsPerPage(0);
        }

        // Le moteur CONFIGURÉ, jamais `engine('meilisearch')` en dur : le même
        // que celui par lequel Scout sert le régime nominal, donc le même
        // préfixe d'index — y compris celui, par exécution, que le harnais de
        // tests pose dans `SCOUT_PREFIX`. Même motif que `SuggestService`.
        /** @var array{results?: array<int, array<string,mixed>>} $response */
        $response = app(EngineManager::class)->engine()->multiSearch($queries);
        $results = $response['results'] ?? [];

        if (count($results) !== count($queries)) {
            return null;
        }

        $unmatched = [];
        foreach ($probed as $i => $mot) {
            if ((int) ($results[$i + 1]['totalHits'] ?? 0) === 0) {
                $unmatched[] = $mot;
            }
        }

        return [$results[0], $unmatched];
    }

    /**
     * Les termes que le MOTEUR va réellement exiger — pas les mots de la saisie.
     *
     * Trois écarts entre les deux, et chacun produirait une phrase fausse s'il
     * était ignoré :
     *
     * 1. **Les mots vides.** Meilisearch les retire à la requête comme à
     *    l'indexation. Sonder « a » dans « villa a louer » nommerait un terme
     *    que le moteur n'a jamais exigé. La liste est LUE dans `config/scout.php`
     *    (TCK-335), jamais recopiée : deux copies divergent, et la divergence se
     *    lit comme un compte plausible.
     * 2. **La ponctuation.** « villa, Saly » porte deux termes, pas un.
     * 3. **Les doublons.** « villa villa » est une requête à UN terme utile ;
     *    la traiter comme deux déclencherait un repli sur une conjonction
     *    triviale.
     *
     * 4. **Le dictionnaire de l'index** (TCK-506). « R+1 » est UN terme pour le
     *    moteur parce que `config/scout.php` le déclare ; découpé sur la
     *    ponctuation il devenait « R » et « 1 », deux sondes qui touchent
     *    presque tout (« rdc », « 150 m2 ») — `q=villa R+7` sans R+7 disait
     *    « aucun bien ne combine tous vos mots » au lieu de nommer R+7, et
     *    `q=R+1` seul passait pour deux termes (revue de PR 253). Les entrées
     *    du dictionnaire sont LUES, jamais recopiées, et reconnues avant le
     *    découpage.
     *
     * Le pliage d'accents suit celui de Meilisearch, qui normalise le jeton
     * avant de le comparer à la liste — c'est ainsi que « À vendre » et
     * « a vendre » se réduisent au même terme utile unique. La casse et
     * l'orthographe D'ORIGINE sont conservées dans la valeur rendue : c'est
     * celle-là que le front affichera à l'utilisateur.
     *
     * @return list<string>
     */
    private function usefulTerms(string $term): array
    {
        if ($term === '') {
            return [];
        }

        $stopWords = $this->stopWords();
        preg_match_all($this->termPattern(), $term, $m);
        $mots = $m[0];

        $useful = [];
        foreach ($mots as $mot) {
            $cle = $this->fold($mot);

            if ($cle === '' || isset($useful[$cle]) || in_array($cle, $stopWords, true)) {
                continue;
            }

            $useful[$cle] = $mot;
        }

        return array_values($useful);
    }

    /**
     * Les mots vides de l'index `properties`, DÉRIVÉS de `config/scout.php`.
     *
     * Repliés comme les jetons qu'on leur comparera, une fois : la liste porte
     * « a » ET « à », et le repliage rend la comparaison indépendante de ce
     * choix d'écriture.
     *
     * @return list<string>
     */
    private function stopWords(): array
    {
        /** @var array<class-string,array<string,mixed>> $settings */
        $settings = (array) config('scout.meilisearch.index-settings', []);
        /** @var array<int,string> $mots */
        $mots = (array) ($settings[Property::class]['stopWords'] ?? []);

        return array_values(array_unique(array_map(fn (string $m): string => $this->fold($m), $mots)));
    }

    /**
     * Le découpage en termes, tel que le moteur le fait : une entrée du
     * `dictionary` de l'index `properties` est un terme entier, tout le reste
     * se coupe sur la ponctuation. Les entrées les plus longues d'abord, pour
     * que « R+10 » ne soit pas lu « R+1 » puis « 0 ».
     */
    private function termPattern(): string
    {
        /** @var array<class-string,array<string,mixed>> $settings */
        $settings = (array) config('scout.meilisearch.index-settings', []);
        /** @var list<string> $entrees */
        $entrees = array_values(array_filter(
            (array) ($settings[Property::class]['dictionary'] ?? []),
            static fn ($e): bool => is_string($e) && $e !== '',
        ));
        usort($entrees, static fn (string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));

        $alternatives = array_map(static fn (string $e): string => preg_quote($e, '/'), $entrees);
        $alternatives[] = '[\p{L}\p{N}]+';

        return '/'.implode('|', $alternatives).'/u';
    }

    /** Minuscule + accents pliés — la normalisation sous laquelle on compare. */
    private function fold(string $value): string
    {
        return Str::ascii(Str::lower($value));
    }

    /**
     * Les clauses moteur qui decrivent le CATALOGUE PUBLIC, et rien d'autre —
     * la transposition Meilisearch de `Property::scopePublic()`.
     *
     * TCK-335 — extraite parce qu'elle a un SECOND appelant : `SuggestService`
     * interroge desormais `POST /indexes/{uid}/facet-search` pour les villes et
     * les quartiers, et une facette comptee sous un filtre INCOMPLET rend un
     * compte faux. Mesure le 2026-08-21 sur la base locale (836 biens, 258
     * publics) : avec les trois premieres clauses seulement (visibility,
     * is_test, published_at) la facette rend « Mermoz 29 » et « Dakar 462 » ;
     * avec les quatre, « Mermoz 20 » et « Dakar 210 » — c'est-a-dire exactement
     * ce que `/search?location=Mermoz` et `/search?city=Dakar` totalisent.
     *
     * ⚠ Ne PAS recopier ces quatre lignes chez l'appelant : deux copies
     * divergent, et la divergence se lit comme un compte plausible.
     *
     * @return list<string>
     */
    public static function publicFilter(): array
    {
        return [
            "visibility = 'public'",
            'is_test = false',
            'published_at IS NOT NULL',
            'NOT status IN ['.self::quoteList(Property::NON_PUBLIC_STATUSES).']',
        ];
    }

    /**
     * Build the Meilisearch filter — outer array is AND-joined, a nested array
     * is OR-joined. The first clauses reproduce `Property::scopePublic()` so a
     * draft / non-public listing can never surface here.
     *
     * @param  array<string,mixed>  $p
     * @return array<int,string|array<int,string>>
     */
    private function buildFilter(array $p): array
    {
        $filter = self::publicFilter();

        // TCK-663 (P01.02) — le panneau propose les noms du référentiel (« Grand Yoff »), une adresse
        // non rattachée porte un texte libre (« Grand-Yoff ») : l'égalité stricte rendait 0 bien.
        // Rattachée, l'adresse se juge par son identifiant ; sinon par sa clé repliée.
        if (! empty($p['location'])) {
            $libre = 'geo_neighborhood_id IS NULL AND neighborhood_key = '.self::quote((string) CleDeQuartier::de((string) $p['location']));
            $ids = app(QuartierDuFiltre::class)->idsDuReferentiel((string) $p['location']);
            $filter[] = $ids === []
                ? $libre
                : '(geo_neighborhood_id IN ['.implode(', ', $ids).'] OR ('.$libre.'))';
        }
        if (! empty($p['city'])) {
            $filter[] = 'city = '.self::quote((string) $p['city']);
        }
        // TCK-635 (ADR-0062 §8) — trois paires de communes homonymes : la région les départage.
        if (! empty($p['region'])) {
            $filter[] = 'region = '.self::quote((string) $p['region']);
        }
        // TCK-599 — `cities`, la forme qu'écrit le formulaire de préférences : OU entre les villes.
        // Aucun moteur ne la lisait, et l'alerte prévenait donc de toute ville.
        if (! empty($p['cities']) && is_array($p['cities'])) {
            $villes = array_values(array_filter(array_map(fn ($v) => trim((string) $v), $p['cities'])));
            if ($villes !== []) {
                $filter[] = array_map(fn (string $v) => 'city = '.self::quote($v), $villes);
            }
        }
        if (isset($p['price_min']) && is_numeric($p['price_min'])) {
            $filter[] = 'price >= '.(float) $p['price_min'];
        }
        if (isset($p['price_max']) && is_numeric($p['price_max'])) {
            $filter[] = 'price <= '.(float) $p['price_max'];
        }
        // TCK-633 (lot E) — chambres, salles de bain et étage sont des MINIMUMS : le panneau
        // affiche « 5+ », et « 5+ chambres » doit trouver la maison de six. L'égalité la ratait.
        // `alertMatches()` passe par ici : les alertes suivent, comme le chemin haversine
        // (`App\Services\Model\SearchService`), qui lisait déjà `bedrooms >=`. Un bien sans
        // valeur reste exclu — Meilisearch écarte les NULL d'une comparaison numérique.
        if (isset($p['bedrooms']) && is_numeric($p['bedrooms'])) {
            $filter[] = 'bedrooms >= '.(int) $p['bedrooms'];
        }
        if (isset($p['bathrooms']) && is_numeric($p['bathrooms'])) {
            $filter[] = 'bathrooms >= '.(int) $p['bathrooms'];
        }
        // TCK-335 — `isset() && is_numeric()`, le motif de `price_min` juste au-dessus,
        // et surtout PAS `! empty()` : `area_min=0` doit AGIR (donc ecarter une surface
        // inconnue), pas etre relu comme « pas de filtre ».
        //
        // Et surtout PAS le motif OR `IS NULL` de la clause `available_from` plus bas :
        // `area` est nullable, et Meilisearch exclut nativement les NULL d'une
        // comparaison numerique. C'est le comportement voulu — un bien a surface
        // inconnue ne peut pas satisfaire « au moins 200 m² », on ne le promet pas.
        // C'est deja la regle de `floor_number` et de `price`, epinglee par
        // `PublicPropertySearchFiltersTest::test_floor_number_filter_excludes_null_floor`.
        if (isset($p['area_min']) && is_numeric($p['area_min'])) {
            $filter[] = 'area >= '.(float) $p['area_min'];
        }
        if (isset($p['area_max']) && is_numeric($p['area_max'])) {
            $filter[] = 'area <= '.(float) $p['area_max'];
        }
        // TCK-335 — UNILATERAL, par alignement sur `PublicPropertyController::index()`
        // qui traite deja ce parametre par `$request->boolean('featured')` sur la meme
        // surface publique. Deux endpoints qui portent le meme mot doivent rendre le
        // meme compte. L'interface n'offre qu'une bascule « en vedette uniquement » :
        // le « non-vedette » n'existe pas au produit.
        if (array_key_exists('featured', $p) && filter_var($p['featured'], FILTER_VALIDATE_BOOLEAN)) {
            $filter[] = 'featured = true';
        }
        // TCK-633 (lot E) — « 2e et + », pas « au 2e » : même règle que les chambres ci-dessus.
        if (isset($p['floor_number']) && is_numeric($p['floor_number'])) {
            $filter[] = 'floor_number >= '.(int) $p['floor_number'];
        }
        // TCK-491 — meme regle que `floor_number` juste au-dessus, et surtout PAS le motif
        // OR `IS NULL` d'`available_from` plus bas : un bien dont le statut foncier est
        // inconnu ne satisfait pas « je veux un titre foncier ». On ne promet pas ce que la
        // donnee ne dit pas.
        if (! empty($p['title_type'])) {
            $filter[] = 'title_type = '.self::quote((string) $p['title_type']);
        }
        // TCK-508 — OU entre les valeurs demandees, et la regle de `title_type` juste
        // au-dessus : un bien sans etat declare ne satisfait aucune d'elles.
        if (! empty($p['condition'])) {
            $etats = array_filter(array_map('trim', explode(',', (string) $p['condition'])));
            if ($etats !== []) {
                $filter[] = array_map(fn ($e) => 'condition = '.self::quote($e), array_values($etats));
            }
        }
        if (! empty($p['type'])) {
            $types = array_filter(array_map('trim', explode(',', (string) $p['type'])));
            if ($types !== []) {
                $filter[] = array_map(fn ($t) => 'type = '.self::quote($t), array_values($types));
            }
        }
        if (! empty($p['contract_type'])) {
            $filter[] = 'contract_type = '.self::quote((string) $p['contract_type']);
        }
        if (! empty($p['rent_period'])) {
            $filter[] = 'rent_period = '.self::quote((string) $p['rent_period']);
        }
        if (array_key_exists('furnished', $p) && $p['furnished'] !== null && $p['furnished'] !== '') {
            $filter[] = 'furnished = '.(filter_var($p['furnished'], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false');
        }
        if (! empty($p['tags'])) {
            $tags = is_array($p['tags']) ? $p['tags'] : explode(',', (string) $p['tags']);
            $tags = array_filter(array_map('trim', $tags));
            // TCK-633 (lot E, décision 4 du porteur) — un ET : une clause PAR équipement, au
            // premier niveau de `$filter` (joint en ET). Le tableau imbriqué d'avant les joignait
            // en OU, et cocher un second équipement ALLONGEAIT la liste. Les alertes suivent.
            foreach (array_values($tags) as $tag) {
                $filter[] = 'tags = '.self::quote((string) $tag);
            }
        }
        if (! empty($p['available_from'])) {
            $ts = Carbon::parse($p['available_from'])->timestamp;
            $filter[] = ['available_from IS NULL', 'available_from <= '.$ts];
        }
        if ($this->hasGeoBounds($p)) {
            $filter[] = sprintf(
                '_geoBoundingBox([%F, %F], [%F, %F])',
                (float) $p['lat_max'], (float) $p['lng_max'],
                (float) $p['lat_min'], (float) $p['lng_min'],
            );
        }
        // TCK-346 / ADR-0023 — le rayon, en MÈTRES pour le moteur.
        //
        // ⚠ C'est LA seule conversion km → m du dépôt : le paramètre public est
        // `radius_km`, `_geoRadius` prend des mètres, et la frontière est ici.
        // Le rayon et le rectangle ci-dessus sont CONJOINTS (`$filter` est un ET
        // de ses éléments) : envoyer les deux rend l'intersection, ce qui est le
        // sens attendu d'« un rayon, dans le cadrage que je regarde ».
        //
        // Un bien sans coordonnées n'a pas de `_geo` dans son document
        // (`Property::toSearchableArray()` ne l'émet que si l'adresse porte les
        // deux colonnes) : il ne satisfait donc AUCUN `_geoRadius`. C'est voulu,
        // et c'est la règle déjà appliquée à `area` et `price` — on ne promet
        // pas ce qu'on ne sait pas.
        if ($this->hasGeoRadius($p)) {
            $filter[] = sprintf(
                '_geoRadius(%F, %F, %F)',
                (float) $p['lat'], (float) $p['lng'],
                (float) $p['radius_km'] * 1000,
            );
        }

        return $filter;
    }

    /**
     * TCK-346 / ADR-0023 — `distance` demande à Meilisearch de classer par
     * éloignement au point donné, du plus proche au plus lointain.
     *
     * ⚠ C'est `_geo` — PAS `_geoPoint` — qui doit figurer dans
     * `sortableAttributes` (config/scout.php) : le moteur résout l'expression
     * de tri vers l'attribut `_geo` et vérifie celui-là. Mesuré sur
     * Meilisearch 1.16 le 2026-08-22, le détail est dans `config/scout.php`.
     * Sans ce réglage le moteur REFUSE la requête (HTTP 400), il ne dégrade pas
     * le tri. C'est un réglage d'INDEX, donc un `search:sync-index-settings` au
     * déploiement.
     *
     * ⚠⚠ Le repli `[]` sur `distance` sans point est INATTEIGNABLE par HTTP :
     * `SearchPublicPropertyRequest` rend 422 (`sort_distance_requires_point`).
     * Il existe pour qu'un appel direct au service — un job, un test — ne
     * produise pas une erreur moteur ; il n'est pas le contrat.
     *
     * @param  array<string,mixed>  $p
     * @return array<int,string>
     */
    private function buildSort(string $sort, string $term, array $p = []): array
    {
        return match ($sort) {
            'price_asc' => ['price:asc'],
            'price_desc' => ['price:desc'],
            'created_desc' => ['created_at:desc'],
            'distance' => $this->hasGeoPoint($p)
                ? [sprintf('_geoPoint(%F,%F):asc', (float) $p['lat'], (float) $p['lng'])]
                : [],
            // TCK-633 lot F (ADR-0061 §7) — sans mot, l'ordre organique est `ranked_at` (qu'une
            // Remontée remet à maintenant) ; `featured` ne trie plus rien.
            default => $term === '' ? ['ranked_at:desc'] : [],
        };
    }

    /**
     * TCK-633 lot F (ADR-0061 §7). Trois lectures au plus : la requête nominale (déjà faite : elle
     * donne `total`, `last_page`, et les places réservées y comptent puisqu'elles en sont
     * issues), le VIVIER (mêmes filtres + `featured = true`, identifiants seuls, ordre organique),
     * et — seulement quand des places réservées existent — la page organique qui les exclut.
     *
     * Les places réservées se calculent sur la page 1 À CHAQUE PAGE : c'est ce qui permet aux pages
     * suivantes de ne pas les répéter, et de décaler leur fenêtre de |R|.
     *
     * @param  array<int, string|array<int, string>>  $filter
     * @param  list<string>  $sort
     * @param  array<string, mixed>  $params
     * @param  array<string, mixed>  $nominal
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>}
     */
    private function placements(string $term, array $filter, array $sort, int $page, int $perPage, array $params, array $nominal, CarbonImmutable $heureDeGraine): array
    {
        $settings = app(BoostSettings::class);
        $slots = $settings->sponsoredSlotsPerPage();
        $reservedMax = min($settings->reservedTopResults(), $perPage);
        $organic = fn (): array => $this->withPlacement($this->hydrate($nominal['hits'] ?? []), 'organic');

        // TCK-983 (P55.02) — au-delà de la dernière page, l'écran ne montre aucun emplacement : rien
        // ne se sert, et aucune impression ne se compte.
        if (($slots === 0 && $reservedMax === 0) || (int) ($nominal['totalHits'] ?? 0) === 0
            || $page > max(1, (int) ($nominal['totalPages'] ?? 1))) {
            return [$organic(), []];
        }

        $pool = $this->featuredPool($term, $filter, $sort);
        if ($pool === []) {
            return [$organic(), []];
        }

        $seed = SponsoredRotation::seed($params, $heureDeGraine);
        $sponsoredIds = SponsoredRotation::pick($pool, $seed, $page, $slots);
        $servedOnFirstPage = $page === 1 ? $sponsoredIds : SponsoredRotation::pick($pool, $seed, 1, $slots);
        $reserved = $reservedMax > 0
            ? array_slice(array_values(array_diff($pool, $servedOnFirstPage)), 0, $reservedMax)
            : [];

        $sponsored = $this->withPlacement($this->hydrateIds($sponsoredIds), 'sponsored');
        // ADR-0061 §10 — une impression par bien réellement servi (hydraté, donc public).
        app(BoostStatsRecorder::class)->impressions(array_column($sponsored, 'id'));

        if ($reserved === []) {
            return [$organic(), $sponsored];
        }

        $offset = $page === 1 ? 0 : ($page - 1) * $perPage - count($reserved);
        $limit = $page === 1 ? $perPage - count($reserved) : $perPage;
        $rest = $limit > 0 ? $this->organicExcluding($term, $filter, $sort, $reserved, $offset, $limit) : [];

        $data = $page === 1
            ? [...$this->withPlacement($this->hydrateIds($reserved), 'reserved'), ...$this->withPlacement($this->hydrate($rest), 'organic')]
            : $this->withPlacement($this->hydrate($rest), 'organic');

        return [$data, $sponsored];
    }

    /**
     * Les vedettes qui satisfont la recherche, dans l'ordre organique, identifiants seuls.
     *
     * @param  array<int, string|array<int, string>>  $filter
     * @param  list<string>  $sort
     * @return list<int>
     */
    private function featuredPool(string $term, array $filter, array $sort): array
    {
        /** @var array<string, mixed> $raw */
        $raw = Property::search($term, function ($index, string $query) use ($filter, $sort) {
            $searchParams = [
                'filter' => [...$filter, 'featured = true'],
                'attributesToRetrieve' => ['id'],
                'offset' => 0,
                'limit' => SponsoredRotation::POOL_CAP,
                'matchingStrategy' => self::STRATEGY_STRICT,
            ];
            if ($sort !== []) {
                $searchParams['sort'] = $sort;
            }

            return $index->search($query, $searchParams);
        })->raw();

        return array_map(static fn (array $hit): int => (int) $hit['id'], $raw['hits'] ?? []);
    }

    /**
     * La fenêtre organique privée des places réservées.
     *
     * @param  array<int, string|array<int, string>>  $filter
     * @param  list<string>  $sort
     * @param  list<int>  $excluded
     * @return array<int, array<string, mixed>>
     */
    private function organicExcluding(string $term, array $filter, array $sort, array $excluded, int $offset, int $limit): array
    {
        /** @var array<string, mixed> $raw */
        $raw = Property::search($term, function ($index, string $query) use ($filter, $sort, $excluded, $offset, $limit) {
            $searchParams = [
                'filter' => [...$filter, 'NOT id IN ['.implode(', ', $excluded).']'],
                'attributesToRetrieve' => ['id'],
                'offset' => max(0, $offset),
                'limit' => $limit,
                'matchingStrategy' => self::STRATEGY_STRICT,
            ];
            if ($sort !== []) {
                $searchParams['sort'] = $sort;
            }

            return $index->search($query, $searchParams);
        })->raw();

        return $raw['hits'] ?? [];
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, mixed>
     */
    private function hydrateIds(array $ids): array
    {
        return $this->hydrate(array_map(static fn (int $id): array => ['id' => $id], $ids));
    }

    /**
     * `placement` : `organic`, `reserved` (place réservée, page 1) ou `sponsored` (emplacement,
     * champ `sponsored` seulement) — le contrat du ticket TCK-633.
     *
     * @param  array<int, mixed>  $rows
     * @return list<array<string, mixed>>
     */
    private function withPlacement(array $rows, string $placement): array
    {
        return array_values(array_map(static fn (array $row): array => $row + ['placement' => $placement], $rows));
    }

    /**
     * Load full models for the hit ids, preserving Meilisearch's order.
     *
     * @param  array<int,array<string,mixed>>  $hits
     * @return array<int,mixed>
     */
    private function hydrate(array $hits): array
    {
        $ids = array_map(static fn (array $hit): int => (int) $hit['id'], $hits);

        if ($ids === []) {
            return [];
        }

        // Re-apply scopePublic() on hydration as defense-in-depth: the engine
        // filter in buildFilter() already excludes non-public / is_test rows,
        // but enforcing it again at the DB layer guarantees a draft, sold or
        // test fixture can never leak even if the index is stale or the Scout
        // engine ignores the raw filter (e.g. the database driver in tests).
        $properties = Property::query()
            ->public()
            ->with('address', 'media')
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        $ordered = collect($ids)
            ->map(static fn (int $id) => $properties->get($id))
            ->filter()
            ->values();

        return PropertyResource::collection($ordered)->resolve();
    }

    /**
     * @param  array<string,mixed>  $p
     */
    private function hasGeoBounds(array $p): bool
    {
        foreach (['lat_min', 'lat_max', 'lng_min', 'lng_max'] as $key) {
            if (! isset($p[$key]) || ! is_numeric($p[$key])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Un point d'origine complet et exploitable.
     *
     * @param  array<string,mixed>  $p
     */
    private function hasGeoPoint(array $p): bool
    {
        return isset($p['lat'], $p['lng']) && is_numeric($p['lat']) && is_numeric($p['lng']);
    }

    /**
     * Un point ET un rayon strictement positif.
     *
     * ⚠ `is_numeric` plutôt que `! empty` : `empty('0')` est vrai, et
     * `lat = 0` est une latitude parfaitement valide. Le chemin haversine
     * (`App\Services\Model\SearchService`) emploie `! empty` et perd donc
     * silencieusement un point sur l'équateur — c'est un des deux défauts que
     * TCK-346 a relevés sur lui.
     *
     * @param  array<string,mixed>  $p
     */
    private function hasGeoRadius(array $p): bool
    {
        return $this->hasGeoPoint($p)
            && isset($p['radius_km'])
            && is_numeric($p['radius_km'])
            && (float) $p['radius_km'] > 0;
    }

    private static function quote(string $value): string
    {
        return "'".str_replace(['\\', "'"], ['\\\\', "\\'"], $value)."'";
    }

    /**
     * @param  array<int,string>  $values
     */
    private static function quoteList(array $values): string
    {
        return implode(', ', array_map(fn (string $v): string => self::quote($v), $values));
    }
}
