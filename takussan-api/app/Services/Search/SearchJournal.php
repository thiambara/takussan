<?php

namespace App\Services\Search;

use App\Support\Http\RobotUserAgent;
use App\Support\VisitorFingerprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

use function Illuminate\Support\defer;

/**
 * TCK-2472 (ADR-0088) — le journal anonyme et agrégé des recherches publiques de biens.
 *
 * **Une ligne par jour et par recherche, rien par personne** (`search_query_stats`) : la saisie normalisée, les critères
 * structurés, quatre compteurs. Le visiteur distinct se compte par une empreinte DU JOUR (`search_query_visitors`,
 * `HMAC-SHA256(IP — /64 en IPv6 —, APP_KEY + jour)`), effacée au-delà de 48 heures : elle ne rejoint ni un autre jour,
 * ni un compte. Ni compte, ni IP en clair, nulle part.
 *
 * **Jamais journalisé** (ADR-0088 §3) : une saisie de plus de 80 caractères, qui porte six chiffres ou plus, ou un `@` —
 * ni le texte, ni la ligne. La règle s'applique aussi aux critères libres (`location`, `city`, `cities`, `region`,
 * `tags`) : un numéro tapé dans le champ du lieu est une saisie comme une autre.
 *
 * **Ce qui est une « recherche »** : la page 1 de la liste publique (`GET /api/public/properties/search`), avec une
 * saisie ou au moins un critère retenu, hors robot déclaré, hors appelant qui coupe les emplacements
 * (`placements=false`, la rangée « À vendre » de l'accueil : elle n'est pas une recherche du visiteur) — cf.
 * {@see self::recordPublicSearch()}. Jamais une frappe : `/api/search/suggest` n'appelle rien ici.
 *
 * **Écriture concurrente sûre** : `insertOrIgnore` sur le visiteur, puis `upsert` aux incréments atomiques sur la
 * ligne ; `distinct_visitors` n'avance que si l'insertion du visiteur a créé une ligne. Les deux dans une transaction :
 * une panne n'écrit rien à moitié. Jamais `try { create } catch` (piège n°1 du `CLAUDE.md` de l'API).
 *
 * **N'échoue jamais la recherche** : la journalisation part après la réponse (`defer`), toute erreur est avalée et
 * rapportée (`report()`).
 */
final class SearchJournal
{
    /** ADR-0088 §3 — au-delà, la saisie n'est jamais journalisée. */
    public const MAX_QUERY_LENGTH = 80;

    /** ADR-0088 §3 — six chiffres ou plus (comptés sur toute la saisie, pas seulement consécutifs) : jamais journalisée. */
    public const MAX_DIGITS = 5;

    /**
     * ADR-0088 §2 — l'empreinte du jour d'un visiteur ne survit pas 48 heures (promis par `privacy.ts` § 6). La purge
     * est HORAIRE et efface dès 47 heures : entre deux passages, aucune n'atteint 48 heures.
     */
    public const VISITOR_MAX_AGE_HOURS = 48;

    /** ADR-0088 §4 — la fenêtre des recherches populaires. */
    public const POPULAR_WINDOW_DAYS = 30;

    /**
     * Les critères retenus : les paramètres publics de `/properties` qui disent une DEMANDE. Délibérément absents : les
     * coordonnées (`lat`, `lng`, `radius_km`, le rectangle de la carte — la position d'un « autour de moi » est celle du
     * visiteur), `available_from` (une date qui change chaque jour défait l'agrégation), et ce qui règle l'affichage
     * (`sort`, `page`, `per_page`, `placements`, `seed_hour`).
     *
     * @var list<string>
     */
    public const CRITERIA_KEYS = [
        'contract_type', 'type', 'rent_period', 'city', 'cities', 'region', 'location',
        'price_min', 'price_max', 'bedrooms', 'bathrooms', 'area_min', 'area_max',
        'furnished', 'featured', 'floor_number', 'title_type', 'condition', 'tags',
    ];

    /** Les critères libres : jugés par la même règle que la saisie. */
    private const FREE_TEXT_KEYS = ['city', 'cities', 'region', 'location', 'tags'];

    /** Les critères multi-valués (liste à virgules dans l'URL) : triés, pour que l'ordre ne fasse pas une autre ligne. */
    private const LIST_KEYS = ['type', 'condition', 'tags', 'cities'];

    private const BOOLEAN_KEYS = ['furnished', 'featured'];

    /**
     * Le point d'appel de la recherche publique : page 1 seulement, hors `placements=false`, après la réponse.
     * Le total retenu est celui du régime STRICT : une recherche servie par le repli élargi (ADR-0024) n'a rien
     * trouvé telle quelle, elle compte comme sans résultat.
     *
     * @param  array<string, mixed>  $validated  `SearchPublicPropertyRequest::validated()`
     * @param  array<string, mixed>  $result  la réponse de `PropertySearchService::search()`
     */
    public function recordPublicSearch(Request $request, array $validated, array $result): void
    {
        try {
            if ((int) ($validated['page'] ?? 1) !== 1) {
                return;
            }
            if (filter_var($validated['placements'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === false) {
                return;
            }
            $q = $validated['q'] ?? $validated['search'] ?? null;
            $total = ($result['search']['strategy'] ?? null) === 'widened' ? 0 : (int) ($result['meta']['total'] ?? 0);

            defer(fn () => $this->record($request, is_string($q) ? $q : null, $validated, $total));
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * Journalise une recherche validée. N'échoue jamais : une erreur est avalée et rapportée.
     *
     * @param  array<string, mixed>  $criteria  les paramètres de la recherche ; seules {@see self::CRITERIA_KEYS} sont lues
     */
    public function record(Request $request, ?string $q, array $criteria, int $total): void
    {
        try {
            if (RobotUserAgent::is($request->userAgent())) {
                return;
            }

            $q = $q === null ? '' : trim($q);
            if (! self::isJournalisable($q)) {
                return;
            }
            $criteria = self::criteria($criteria);
            if ($criteria === null) {
                return;
            }
            $normalized = self::normalize($q);
            if ($normalized === '' && $criteria === []) {
                return;
            }

            $this->write($request->ip(), $normalized === '' ? null : $normalized, $criteria, max(0, $total));
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * Les recherches vues par au moins `search.journal.min_visitors` visiteurs distincts UN MÊME JOUR dans les
     * {@see self::POPULAR_WINDOW_DAYS} derniers jours, dont le DERNIER nombre de résultats est positif, et dont la saisie
     * normalisée commence par le préfixe normalisé (préfixe vide : toutes, y compris les recherches par critères seuls,
     * dont `text` est alors vide).
     *
     * `count` = la somme des visiteurs distincts de chaque jour de la fenêtre (des visiteurs-jours : un visiteur qui
     * revient un autre jour compte deux fois, ADR-0088 Conséquences). Tri : `count` décroissant, puis la saisie.
     *
     * @return list<array{text: string, criteria: array<string, mixed>, count: int}>
     */
    public function popular(string $prefix, int $limit): array
    {
        if ($limit < 1) {
            return [];
        }
        $prefix = self::normalize($prefix);

        $rows = DB::table('search_query_stats')
            ->selectRaw('max(normalized_query) as normalized_query')
            ->selectRaw('(array_agg(criteria order by day desc))[1] as criteria')
            ->selectRaw('sum(distinct_visitors) as visitors')
            ->where('day', '>=', now()->subDays(self::POPULAR_WINDOW_DAYS - 1)->toDateString())
            ->when($prefix !== '', fn ($query) => $query->where(
                'normalized_query', 'like', addcslashes($prefix, '\\%_').'%',
            ))
            ->groupBy('query_key')
            ->havingRaw('max(distinct_visitors) >= ?', [max(1, (int) config('search.journal.min_visitors', 5))])
            ->havingRaw('(array_agg(last_results_count order by day desc))[1] > 0')
            ->orderByDesc('visitors')
            ->orderByRaw('max(normalized_query) asc nulls last')
            ->orderBy('query_key')
            ->limit($limit)
            ->get();

        return $rows->map(fn (object $row): array => [
            'text' => (string) ($row->normalized_query ?? ''),
            'criteria' => self::decodeCriteria($row->criteria),
            'count' => (int) $row->visitors,
        ])->values()->all();
    }

    /**
     * La demande sans résultat des `$days` derniers jours (aujourd'hui compris) : les recherches qui ont rendu zéro
     * au moins une fois dans la fenêtre et dont le DERNIER nombre de résultats est encore zéro. `distinct_visitors` =
     * la somme des visiteurs distincts des jours où elle a rendu zéro (visiteurs-jours). Pour TCK-2470 et la console :
     * jamais montrée au public (ADR-0088 §4).
     *
     * @return list<array{criteria: array<string, mixed>, normalized_query: ?string, distinct_visitors: int}>
     */
    public function zeroResultDemand(int $days, int $minVisitors = 1, int $limit = 200): array
    {
        if ($days < 1 || $limit < 1) {
            return [];
        }

        $rows = DB::table('search_query_stats')
            ->selectRaw('max(normalized_query) as normalized_query')
            ->selectRaw('(array_agg(criteria order by day desc))[1] as criteria')
            ->selectRaw('coalesce(sum(distinct_visitors) filter (where zero_results_count > 0), 0) as visitors')
            ->where('day', '>=', now()->subDays($days - 1)->toDateString())
            ->groupBy('query_key')
            ->havingRaw('sum(zero_results_count) > 0')
            ->havingRaw('(array_agg(last_results_count order by day desc))[1] = 0')
            ->havingRaw('coalesce(sum(distinct_visitors) filter (where zero_results_count > 0), 0) >= ?', [max(1, $minVisitors)])
            ->orderByDesc('visitors')
            ->orderByRaw('max(normalized_query) asc nulls last')
            ->orderBy('query_key')
            ->limit($limit)
            ->get();

        return $rows->map(fn (object $row): array => [
            'criteria' => self::decodeCriteria($row->criteria),
            'normalized_query' => $row->normalized_query === null ? null : (string) $row->normalized_query,
            'distinct_visitors' => (int) $row->visitors,
        ])->values()->all();
    }

    /**
     * Efface les empreintes de visiteur d'au moins `VISITOR_MAX_AGE_HOURS - 1` heures (la purge est horaire : aucune
     * n'atteint {@see self::VISITOR_MAX_AGE_HOURS} heures) et les lignes du journal dont le jour a plus de
     * `search.journal.retention_months` mois. Idempotente : une suppression par date.
     *
     * @return array{visitors: int, stats: int}
     */
    public function purge(): array
    {
        $visitors = DB::table('search_query_visitors')
            ->where('created_at', '<=', now()->subHours(self::VISITOR_MAX_AGE_HOURS - 1))
            ->delete();
        $stats = DB::table('search_query_stats')
            ->where('day', '<', now()->subMonths(max(1, (int) config('search.journal.retention_months', 13)))->toDateString())
            ->delete();

        return ['visitors' => $visitors, 'stats' => $stats];
    }

    /**
     * ADR-0088 §3 — vrai si le texte PEUT être journalisé : au plus 80 caractères, moins de six chiffres (de toute
     * écriture), aucun `@` (ni sa forme pleine chasse).
     */
    public static function isJournalisable(string $text): bool
    {
        if (mb_strlen(trim($text)) > self::MAX_QUERY_LENGTH) {
            return false;
        }
        if (preg_match_all('/\p{Nd}/u', $text) > self::MAX_DIGITS) {
            return false;
        }

        return ! str_contains($text, '@') && ! str_contains($text, '＠') && ! str_contains($text, '﹫');
    }

    /** Minuscules, sans accents, blancs repliés. */
    public static function normalize(string $text): string
    {
        $ascii = Str::ascii(Str::lower($text));

        return trim((string) preg_replace('/\s+/u', ' ', $ascii));
    }

    /**
     * Les critères retenus, sous une forme canonique (clés triées, listes en chaîne à virgules triée — la forme de
     * l'URL —, nombres et booléens typés, chaînes aux blancs repliés) ; `null` si un critère libre n'est pas journalisable — la recherche entière ne l'est pas.
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>|null
     */
    public static function criteria(array $params): ?array
    {
        $criteria = [];
        foreach (self::CRITERIA_KEYS as $key) {
            if (! array_key_exists($key, $params)) {
                continue;
            }
            $value = self::canonicalValue($key, $params[$key]);
            if ($value === null || $value === '') {
                continue;
            }
            if (in_array($key, self::FREE_TEXT_KEYS, true)) {
                foreach (explode(',', (string) $value) as $text) {
                    if (! self::isJournalisable((string) $text)) {
                        return null;
                    }
                }
            }
            $criteria[$key] = $value;
        }
        ksort($criteria);

        return $criteria;
    }

    /**
     * @param  array<string, mixed>  $criteria
     */
    private function write(?string $ip, ?string $normalized, array $criteria, int $total): void
    {
        $day = now()->toDateString();
        $key = self::queryKey($normalized, $criteria);

        DB::transaction(function () use ($ip, $normalized, $criteria, $total, $day, $key): void {
            $newVisitor = 0;
            if ($ip !== null && $ip !== '') {
                $newVisitor = DB::table('search_query_visitors')->insertOrIgnore([
                    'day' => $day,
                    'query_key' => $key,
                    'visitor_hash' => self::visitorHash($ip, $day),
                    'created_at' => now(),
                ]) > 0 ? 1 : 0;
            }

            DB::table('search_query_stats')->upsert(
                [[
                    'day' => $day,
                    'query_key' => $key,
                    'normalized_query' => $normalized,
                    'criteria' => json_encode((object) $criteria, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                    'searches_count' => 1,
                    'distinct_visitors' => $newVisitor,
                    'zero_results_count' => $total === 0 ? 1 : 0,
                    'last_results_count' => $total,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]],
                ['day', 'query_key'],
                [
                    'searches_count' => DB::raw('search_query_stats.searches_count + excluded.searches_count'),
                    'distinct_visitors' => DB::raw('search_query_stats.distinct_visitors + excluded.distinct_visitors'),
                    'zero_results_count' => DB::raw('search_query_stats.zero_results_count + excluded.zero_results_count'),
                    'last_results_count' => DB::raw('excluded.last_results_count'),
                    'updated_at' => DB::raw('excluded.updated_at'),
                ],
            );
        });
    }

    /** ADR-0088 §2 — `HMAC-SHA256(IP — /64 en IPv6 —, APP_KEY + jour)` : une autre empreinte chaque jour. */
    private static function visitorHash(string $ip, string $day): string
    {
        return hash_hmac('sha256', VisitorFingerprint::network($ip), config('app.key').'|'.$day);
    }

    /**
     * La clé d'agrégation : la saisie normalisée et la signature des critères, dont les chaînes sont comparées sans
     * casse ni accents (« Dakar » et « dakar » sont la même recherche ; la ligne garde la forme de la première).
     *
     * @param  array<string, mixed>  $criteria
     */
    private static function queryKey(?string $normalized, array $criteria): string
    {
        $signature = [];
        foreach ($criteria as $key => $value) {
            if (in_array($key, self::LIST_KEYS, true)) {
                $items = array_values(array_unique(array_map(self::normalize(...), explode(',', (string) $value))));
                sort($items, SORT_STRING);
                $signature[$key] = $items;
            } else {
                $signature[$key] = is_string($value) ? self::normalize($value) : $value;
            }
        }

        return hash('sha256', ($normalized ?? '')."\x1F".json_encode($signature, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    private static function canonicalValue(string $key, mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }
        if (in_array($key, self::BOOLEAN_KEYS, true)) {
            return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        }
        if (in_array($key, self::LIST_KEYS, true)) {
            // La forme de l'URL (`type=house,villa`), valeurs triées : l'ordre ne fait pas une autre recherche.
            $items = is_array($value) ? $value : explode(',', (string) $value);
            $items = array_values(array_unique(array_filter(
                array_map(fn (mixed $v): string => self::collapse((string) $v), array_filter($items, 'is_scalar')),
                fn (string $v): bool => $v !== '',
            )));
            sort($items, SORT_STRING);

            return implode(',', $items);
        }
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value) || (is_string($value) && is_numeric(trim($value)))) {
            $number = trim((string) $value) + 0;

            return is_float($number) && floor($number) === $number && abs($number) < PHP_INT_MAX ? (int) $number : $number;
        }

        return is_scalar($value) ? self::collapse((string) $value) : null;
    }

    private static function collapse(string $text): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }

    /** @return array<string, mixed> */
    private static function decodeCriteria(mixed $criteria): array
    {
        $decoded = is_string($criteria) ? json_decode($criteria, true) : $criteria;

        return is_array($decoded) ? $decoded : [];
    }
}
