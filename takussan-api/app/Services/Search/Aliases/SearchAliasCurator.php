<?php

namespace App\Services\Search\Aliases;

use App\Ai\Usages\SearchAliasesUsage;
use App\Models\AiCall;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\PropertyType;
use App\Models\Enums\SearchAliasOrigin;
use App\Models\Enums\SearchAliasStatus;
use App\Models\Enums\SearchAliasTargetKind;
use App\Models\SearchAlias;
use App\Models\SearchAliasSetting;
use App\Models\User;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Search\Query\DatabasePlaceLexicon;
use App\Services\Search\Query\SearchQueryParser;
use App\Services\Search\SearchJournal;
use App\Support\Search\CleDeQuartier;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-2476 (ADR-0088 §7) — un passage des variantes d'écriture de la recherche.
 *
 * Dans cet ordre :
 *  1. **Au nom d'un opérateur explicite** : celui que la commande désigne (`--operator`, un lancement manuel), sinon
 *     celui du réglage {@see SearchAliasSetting} — celui qui l'a allumé. Éteint → aucun passage, rien d'inscrit ;
 *     opérateur disparu → aucun passage, issue `search.aliases.operator_missing`. Plus aucun `super_admin` choisi
 *     d'office (revue adverse du 2026-11-04). Chaque passage inscrit son issue sur le réglage (`last_run_*`).
 *  2. Les saisies : la demande sans résultat du journal ({@see SearchJournal::zeroResultDemand()}), sur
 *     {@see self::WINDOW_DAYS} jours, portée par au moins {@see self::MIN_VISITORS} visiteurs distincts, au plus
 *     {@see self::MAX_QUERIES} ; seules celles qui portent un texte que l'analyse ne comprend pas entièrement (un résidu).
 *     Elles ont déjà passé les exclusions d'ADR-0088 §3 à l'écriture du journal.
 *  3. **Pas d'appel inutile** : aucune saisie, ou les mêmes que le dernier passage appelé ({@see self::SIGNATURE_KEY}).
 *  4. L'appel à `search.variantes`, HORS de toute transaction.
 *  5. **Le modèle propose, le code valide**, proposition par proposition :
 *     - l'écriture se replie en mots (`CleDeQuartier`), est écrite dans une saisie reçue, et n'en est pas faite que de
 *       mots vides ou de chiffres ;
 *     - **sa cible existe** : un lieu du référentiel ({@see DatabasePlaceLexicon::entries()}, la ville d'un quartier
 *       comprise), une valeur de `PropertyType`, un terme du vocabulaire ({@see SearchQueryParser::termEntry()}) ;
 *     - une variante déjà connue pour la même cible : `rejected` → jamais rouverte ; `manual` → jamais touchée ; `ai`
 *       active → ses preuves sont mises à jour ;
 *     - une variante nouvelle que l'analyse comprend déjà (le nom même de la cible, un mot du vocabulaire, une autre
 *       variante) est écartée : elle n'apprend rien, ou elle désignerait deux choses ;
 *     - confiance sous {@see self::MIN_CONFIDENCE}, ou au-delà de {@see self::MAX_PER_RUN} créations : écartée ;
 *     - **revue adverse n° 3 (2026-11-04)** — une variante nouvelle est créée ACTIVE, sans relecture : elle doit donc
 *       être sûre par construction. Écartée si elle n'est faite que de mots courants ({@see self::DISCARD_COMMON_WORD} :
 *       mots de l'analyse, mots vides, {@see self::MARKET_WORDS}), si elle est le nom d'une AUTRE cible
 *       ({@see self::DISCARD_OTHER_TARGET}), ou si elle n'est pas PROCHE de sa cible ({@see self::DISCARD_NOT_CLOSE} :
 *       ni faute de frappe, ni écriture phonétique, ni abréviation — {@see self::isClose()}). « proche » → Almadies
 *       détournait toute saisie qui le portait ; « wakam » → Ouakam et « aprt » → appartement restent apprises.
 *  6. Les caches de l'analyse sont vidés ; l'index des suggestions relit les variantes à sa reconstruction horaire.
 *
 * Idempotent : une variante est unique par (écriture, sorte, cible) — un second passage sur les mêmes propositions ne
 * crée rien, il met à jour les mêmes preuves.
 */
final class SearchAliasCurator
{
    public const OUTCOME_APPLIED = 'applied';

    public const OUTCOME_UNCHANGED = 'unchanged';

    public const OUTCOME_NO_SIGNALS = 'no_signals';

    public const OUTCOME_INVALID_OUTPUT = 'search.aliases.invalid_output';

    public const DISCARD_INVALID = 'search.aliases.invalid_proposal';

    public const DISCARD_TARGET_UNKNOWN = 'search.aliases.target_unknown';

    public const DISCARD_NOT_IN_QUERIES = 'search.aliases.not_in_queries';

    public const DISCARD_ALREADY_UNDERSTOOD = 'search.aliases.already_understood';

    public const DISCARD_DUPLICATE = 'search.aliases.duplicate';

    public const DISCARD_REJECTED = 'search.aliases.rejected';

    public const DISCARD_MANUAL = 'search.aliases.manual';

    public const DISCARD_LOW_CONFIDENCE = 'search.aliases.low_confidence';

    public const DISCARD_TOO_MANY = 'search.aliases.too_many';

    public const DISCARD_COMMON_WORD = 'search.aliases.common_word';

    public const DISCARD_OTHER_TARGET = 'search.aliases.other_target';

    public const DISCARD_NOT_CLOSE = 'search.aliases.not_close';

    /**
     * Revue adverse n° 3 — des mots du marché et de la ville que l'analyse ne lit pas (ils restent au résidu) et qu'une
     * variante ne doit jamais capter : ils figurent dans des saisies de tous les lieux. Liste courte et FERMÉE ; les
     * mots de l'analyse viennent de {@see SearchQueryParser::isCommonWord()}.
     */
    private const MARKET_WORDS = [
        'proche', 'pres', 'cote', 'centre', 'centreville', 'ville', 'quartier', 'zone', 'secteur', 'route', 'rue', 'avenue',
        'boulevard', 'plage', 'mer', 'ocean', 'corniche', 'ecole', 'universite', 'marche', 'mosquee', 'eglise', 'hopital',
        'aeroport', 'autoroute', 'gare', 'luxe', 'luxueux', 'luxueuse', 'neuf', 'neuve', 'nouveau', 'nouvelle', 'ancien',
        'ancienne', 'moderne', 'beau', 'belle', 'joli', 'jolie', 'grand', 'grande', 'petit', 'petite', 'calme', 'propre',
        'spacieux', 'spacieuse', 'lumineux', 'lumineuse', 'cher', 'pas', 'bon', 'bonne', 'bien', 'urgent', 'vite',
        'residence', 'cite', 'immeuble', 'agence', 'proprietaire', 'particulier', 'prix', 'nord', 'sud', 'est', 'ouest',
        'near', 'close', 'beach', 'sea', 'city', 'center', 'centre', 'downtown', 'new', 'cheap', 'nice', 'big', 'small',
    ];

    public const WINDOW_DAYS = 30;

    public const MIN_VISITORS = 2;

    public const MAX_QUERIES = 200;

    public const MIN_CONFIDENCE = 0.7;

    public const MAX_PER_RUN = 50;

    /** L'empreinte des saisies du dernier passage qui a appelé le modèle. */
    public const SIGNATURE_KEY = 'search.aliases.last_signature';

    public function __construct(
        private readonly SearchJournal $journal,
        private readonly AiGateway $gateway,
        private readonly SearchQueryParser $parser,
        private readonly DatabasePlaceLexicon $places,
    ) {}

    /**
     * Un passage ; son issue est inscrite sur le réglage (`last_run_at`, `last_run_outcome`) — sauf réglage éteint, où
     * rien ne passe et rien ne s'inscrit.
     *
     * @param  User|null  $operator  un lancement manuel (`--operator`), réglage éteint ou non ; `null` : l'opérateur du
     *                               réglage {@see SearchAliasSetting}, celui qui l'a allumé
     * @return array{outcome: string, created: int, updated: int, discarded: list<array{alias: string, code: string}>}
     */
    public function run(?User $operator = null): array
    {
        if ($operator === null) {
            $setting = SearchAliasSetting::current();
            $blocked = $setting->blockedReason();
            if ($blocked === SearchAliasSetting::BLOCKED_DISABLED) {
                return self::result($blocked);
            }
            if ($blocked !== null) {
                return $this->finish(self::result($blocked));
            }
            /** @var User $operator */
            $operator = $setting->operator;
        }

        return $this->finish($this->pass($operator));
    }

    /**
     * Le passage lui-même, au nom de `$operator`.
     *
     * @return array{outcome: string, created: int, updated: int, discarded: list<array{alias: string, code: string}>}
     */
    private function pass(User $operator): array
    {
        $queries = $this->queries();
        if ($queries === []) {
            return self::result(self::OUTCOME_NO_SIGNALS);
        }
        $signature = hash('sha256', json_encode($queries, JSON_THROW_ON_ERROR));
        if (Cache::get(self::SIGNATURE_KEY) === $signature) {
            return self::result(self::OUTCOME_UNCHANGED);
        }

        $places = $this->places->entries();
        try {
            $result = $this->gateway->run(new AiRequest(
                SearchAliasesUsage::KEY,
                $this->input($queries, $places),
                [AiDataClass::Publique],
                actor: $operator,
            ));
        } catch (AiRefused $e) {
            return self::result('ai.'.$e->reason->value);
        } catch (AiUnavailable $e) {
            return self::result($e->getMessage());
        } catch (Throwable $e) {
            // Journalisée par la passerelle ; le passage suivant retentera.
            report($e);

            return self::result(AiErrorCode::fromThrowable($e));
        }

        $proposals = $result->structured['aliases'] ?? null;
        if (! is_array($proposals) || ! array_is_list($proposals)) {
            return self::result(self::OUTCOME_INVALID_OUTPUT);
        }

        $applied = $this->apply($proposals, $queries, $places, $result->call);
        Cache::forever(self::SIGNATURE_KEY, $signature);
        SearchAlias::forgetCaches();

        if ($applied['discarded'] !== []) {
            Log::info('search.aliases.discarded', ['ai_call_id' => $result->call->id, 'discarded' => $applied['discarded']]);
        }

        return ['outcome' => self::OUTCOME_APPLIED, ...$applied];
    }

    /**
     * Les saisies sans résultat qui portent un texte non compris, de la plus portée à la moins portée.
     *
     * @return list<array{q: string, visitors: int}>
     */
    public function queries(): array
    {
        $queries = [];
        foreach ($this->journal->zeroResultDemand(self::WINDOW_DAYS, self::MIN_VISITORS, self::MAX_QUERIES) as $row) {
            $q = $row['normalized_query'];
            if ($q === null || ! SearchJournal::isJournalisable($q) || $this->parser->parse($q, 'fr')->residue === null) {
                continue;
            }
            $queries[] = ['q' => $q, 'visitors' => $row['distinct_visitors']];
        }

        return $queries;
    }

    /**
     * L'entrée du modèle : les saisies (texte normalisé, nombre de visiteurs) et les entités connues. Rien d'autre.
     *
     * @param  list<array{q: string, visitors: int}>  $queries
     * @param  list<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}>  $places
     */
    public function input(array $queries, array $places): string
    {
        $cities = [];
        $neighborhoods = [];
        foreach ($places as $place) {
            if ($place['kind'] === 'city') {
                $cities[$place['name']] = true;
            } else {
                $neighborhoods[$place['name'].'|'.$place['city']] = ['name' => $place['name'], 'city' => $place['city']];
            }
        }

        return json_encode([
            'queries' => $queries,
            'known' => [
                'cities' => array_keys($cities),
                'neighborhoods' => array_values($neighborhoods),
                'property_types' => array_map(static fn (PropertyType $type): array => [
                    'value' => $type->value,
                    'labels' => array_values(array_unique([(string) trans('properties.type.'.$type->value, [], 'fr'), (string) trans('properties.type.'.$type->value, [], 'en')])),
                ], PropertyType::cases()),
                'terms' => SearchQueryParser::terms(),
            ],
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * @param  list<mixed>  $proposals
     * @param  list<array{q: string, visitors: int}>  $queries
     * @param  list<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}>  $places
     * @return array{created: int, updated: int, discarded: list<array{alias: string, code: string}>}
     */
    private function apply(array $proposals, array $queries, array $places, AiCall $call): array
    {
        $created = 0;
        $updated = 0;
        $discarded = [];
        $seen = [];
        $targets = self::targetsByAlias($proposals);

        foreach ($proposals as $proposal) {
            $alias = is_array($proposal) && is_string($proposal['alias'] ?? null) ? SearchAlias::fold($proposal['alias']) : null;
            $discard = function (string $code) use (&$discarded, $alias, $proposal): void {
                $discarded[] = ['alias' => $alias ?? (is_array($proposal) && is_string($proposal['alias'] ?? null) ? mb_substr($proposal['alias'], 0, 80) : ''), 'code' => $code];
            };

            if ($alias === null || ! self::wellFormed($alias)) {
                $discard(self::DISCARD_INVALID);

                continue;
            }
            $target = $this->target($proposal, $places);
            if ($target === null) {
                $discard(self::DISCARD_TARGET_UNKNOWN);

                continue;
            }
            $evidence = self::evidence($alias, $queries);
            if ($evidence === null) {
                $discard(self::DISCARD_NOT_IN_QUERIES);

                continue;
            }
            // Une écriture proposée pour deux cibles ne désigne rien de sûr ; proposée deux fois, elle ne compte qu'une.
            if (count($targets[$alias] ?? []) > 1 || isset($seen[$alias])) {
                $discard(self::DISCARD_DUPLICATE);

                continue;
            }
            $seen[$alias] = true;

            $confidence = is_numeric($proposal['confidence'] ?? null) ? (float) $proposal['confidence'] : 0.0;
            $evidence += ['confidence' => round($confidence, 2), 'ai_call_id' => $call->id];

            $existing = SearchAlias::query()
                ->where('alias', $alias)->where('target_kind', $target['kind']->value)->where('target_value', $target['value'])
                ->first();
            if ($existing !== null) {
                $code = match (true) {
                    $existing->status === SearchAliasStatus::Rejected => self::DISCARD_REJECTED,
                    $existing->origin === SearchAliasOrigin::Manual => self::DISCARD_MANUAL,
                    default => null,
                };
                if ($code !== null) {
                    $discard($code);

                    continue;
                }
                $existing->forceFill(['target_city' => $target['city'], 'evidence' => $evidence])->save();
                $updated++;

                continue;
            }

            if ($confidence < self::MIN_CONFIDENCE) {
                $discard(self::DISCARD_LOW_CONFIDENCE);

                continue;
            }
            if ($this->parser->parse($alias, 'fr')->understood) {
                $discard(self::DISCARD_ALREADY_UNDERSTOOD);

                continue;
            }
            $unsafe = match (true) {
                self::onlyCommonWords($alias) => self::DISCARD_COMMON_WORD,
                self::namesAnotherTarget($alias, $target, $places) => self::DISCARD_OTHER_TARGET,
                ! self::closeToTarget($alias, $target, $places) => self::DISCARD_NOT_CLOSE,
                default => null,
            };
            if ($unsafe !== null) {
                $discard($unsafe);

                continue;
            }
            if ($created >= self::MAX_PER_RUN) {
                $discard(self::DISCARD_TOO_MANY);

                continue;
            }

            $now = now();
            $inserted = DB::table('search_aliases')->insertOrIgnore([
                'alias' => $alias,
                'target_kind' => $target['kind']->value,
                'target_value' => $target['value'],
                'target_city' => $target['city'],
                'origin' => SearchAliasOrigin::Ai->value,
                'status' => SearchAliasStatus::Active->value,
                'evidence' => json_encode($evidence, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $created += $inserted;
        }

        return ['created' => $created, 'updated' => $updated, 'discarded' => $discarded];
    }

    /**
     * La cible proposée, si elle existe — sous l'écriture du référentiel (nom du lieu, ville du quartier), la valeur du
     * type, ou le terme replié.
     *
     * @param  list<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}>  $places
     * @return array{kind: SearchAliasTargetKind, value: string, city: ?string}|null
     */
    private function target(mixed $proposal, array $places): ?array
    {
        if (! is_array($proposal) || ! is_string($proposal['target_value'] ?? null)) {
            return null;
        }
        $kind = SearchAliasTargetKind::tryFrom((string) ($proposal['target_kind'] ?? ''));
        $value = CleDeQuartier::de($proposal['target_value']);
        $city = is_string($proposal['target_city'] ?? null) ? CleDeQuartier::de($proposal['target_city']) : null;
        if ($kind === null || $value === null) {
            return null;
        }

        if ($kind === SearchAliasTargetKind::PropertyType) {
            $type = PropertyType::tryFrom(trim($proposal['target_value']));

            return $type === null ? null : ['kind' => $kind, 'value' => $type->value, 'city' => null];
        }
        if ($kind === SearchAliasTargetKind::Term) {
            return SearchQueryParser::termEntry($value) === null ? null : ['kind' => $kind, 'value' => $value, 'city' => null];
        }

        // Un lieu : par son NOM du référentiel (un ancien nom n'est pas une cible : c'est déjà une écriture connue).
        $matches = [];
        foreach ($places as $place) {
            if ($place['kind'] !== $kind->value || CleDeQuartier::de($place['name']) !== $value || CleDeQuartier::de($place['spelling']) !== $value) {
                continue;
            }
            if ($kind === SearchAliasTargetKind::Neighborhood && $city !== null && CleDeQuartier::de($place['city']) !== $city) {
                continue;
            }
            $matches[$place['name'].'|'.$place['city']] = $place;
        }
        // Un quartier de même nom dans deux villes, sans ville proposée : on ne choisit pas au hasard.
        if (count($matches) !== 1) {
            return null;
        }
        $place = array_values($matches)[0];

        return ['kind' => $kind, 'value' => $place['name'], 'city' => $kind === SearchAliasTargetKind::Neighborhood ? $place['city'] : null];
    }

    /**
     * Les cibles proposées pour chaque écriture repliée (sorte et valeur repliée).
     *
     * @param  list<mixed>  $proposals
     * @return array<string, array<string, true>>
     */
    private static function targetsByAlias(array $proposals): array
    {
        $targets = [];
        foreach ($proposals as $proposal) {
            if (! is_array($proposal) || ! is_string($proposal['alias'] ?? null) || ! is_string($proposal['target_value'] ?? null)) {
                continue;
            }
            $alias = SearchAlias::fold($proposal['alias']);
            if ($alias !== null) {
                $targets[$alias][((string) ($proposal['target_kind'] ?? '')).'|'.CleDeQuartier::de($proposal['target_value'])] = true;
            }
        }

        return $targets;
    }

    /** Vrai si chaque mot de l'écriture est un mot courant : de l'analyse, vide, ou du marché. */
    private static function onlyCommonWords(string $alias): bool
    {
        foreach (explode(' ', $alias) as $word) {
            if (! SearchQueryParser::isCommonWord($word) && ! in_array($word, self::MARKET_WORDS, true)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Vrai si l'écriture est le nom (ou une écriture du référentiel) d'un AUTRE lieu, le libellé d'un AUTRE type, ou un
     * autre terme : elle désignerait deux choses.
     *
     * @param  array{kind: SearchAliasTargetKind, value: string, city: ?string}  $target
     * @param  list<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}>  $places
     */
    private static function namesAnotherTarget(string $alias, array $target, array $places): bool
    {
        foreach ($places as $place) {
            $same = $place['kind'] === $target['kind']->value && $place['name'] === $target['value']
                && ($target['kind'] !== SearchAliasTargetKind::Neighborhood || $place['city'] === $target['city']);
            if (! $same && in_array($alias, [CleDeQuartier::de($place['name']), CleDeQuartier::de($place['spelling'])], true)) {
                return true;
            }
        }
        foreach (PropertyType::cases() as $type) {
            if ($target['kind'] === SearchAliasTargetKind::PropertyType && $type->value === $target['value']) {
                continue;
            }
            if (in_array($alias, self::typeSpellings($type), true)) {
                return true;
            }
        }
        $term = SearchQueryParser::termEntry($alias);

        return $term !== null && ! ($target['kind'] === SearchAliasTargetKind::Term && SearchQueryParser::termEntry($target['value']) === $term);
    }

    /**
     * Vrai si l'écriture est PROCHE d'une écriture de sa cible ({@see self::isClose()}) : le nom du lieu et ses écritures
     * du référentiel, les écritures et libellés du type, les écritures du terme.
     *
     * @param  array{kind: SearchAliasTargetKind, value: string, city: ?string}  $target
     * @param  list<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}>  $places
     */
    private static function closeToTarget(string $alias, array $target, array $places): bool
    {
        $spellings = match ($target['kind']) {
            SearchAliasTargetKind::PropertyType => self::typeSpellings(PropertyType::from($target['value'])),
            SearchAliasTargetKind::Term => [$target['value'], ...(($entry = SearchQueryParser::termEntry($target['value'])) === null
                ? [] : SearchQueryParser::spellingsOf($entry['key'], $entry['value']))],
            default => array_merge(...array_map(
                static fn (array $place): array => [(string) CleDeQuartier::de($place['name']), (string) CleDeQuartier::de($place['spelling'])],
                array_values(array_filter($places, static fn (array $place): bool => $place['kind'] === $target['kind']->value
                    && $place['name'] === $target['value'] && ($target['kind'] !== SearchAliasTargetKind::Neighborhood || $place['city'] === $target['city']))),
            ) ?: [[(string) CleDeQuartier::de($target['value'])]]),
        };
        foreach ($spellings as $spelling) {
            if ($spelling !== '' && self::isClose($alias, $spelling)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> les écritures repliées d'un type : celles de l'analyse et ses libellés fr / en */
    private static function typeSpellings(PropertyType $type): array
    {
        return array_values(array_unique(array_filter([
            ...SearchQueryParser::spellingsOf('type', $type->value),
            (string) CleDeQuartier::de((string) trans('properties.type.'.$type->value, [], 'fr')),
            (string) CleDeQuartier::de((string) trans('properties.type.'.$type->value, [], 'en')),
        ])));
    }

    /**
     * Revue adverse n° 3 — l'écriture `$alias` est-elle une manière d'écrire `$spelling` (deux formes repliées) ?
     *  - une faute : au plus un tiers de lettres à changer (distance de Damerau), sur l'écriture brute ou phonétique ;
     *  - une écriture phonétique simple : `ou` ↔ `w`, `c`/`q` ↔ `k`, `ph` ↔ `f`, `y` ↔ `i`, `h` muet, lettres doublées,
     *    `e`/`s` finaux (« wakam » ~ « ouakam ») ;
     *  - une abréviation : les lettres de l'écriture, dans l'ordre, dans la cible, à commencer par la même (« aprt » ⊂
     *    « appartement »), sur trois lettres au moins ; ou les initiales d'un nom de plusieurs mots (« pa »).
     */
    private static function isClose(string $alias, string $spelling): bool
    {
        $a = str_replace(' ', '', $alias);
        $s = str_replace(' ', '', $spelling);
        if ($a === '' || $s === '') {
            return false;
        }
        if ($a === $s || self::phonetic($a) === self::phonetic($s)) {
            return true;
        }
        foreach ([[$a, $s], [self::phonetic($a), self::phonetic($s)]] as [$x, $y]) {
            if (self::distance($x, $y) * 3 <= max(strlen($x), strlen($y))) {
                return true;
            }
        }
        $words = explode(' ', $spelling);
        if (count($words) > 1 && $a === implode('', array_map(static fn (string $w): string => $w[0], $words))) {
            return true;
        }

        return strlen($a) >= 3 && strlen($a) < strlen($s) && $a[0] === $s[0] && self::isSubsequence($a, $s);
    }

    private static function phonetic(string $word): string
    {
        $word = strtr($word, ['ou' => 'w', 'ph' => 'f', 'qu' => 'k', 'ck' => 'k', 'dj' => 'j', 'y' => 'i', 'q' => 'k', 'c' => 'k', 'h' => '', 'z' => 's']);
        $word = (string) preg_replace('/(.)\1+/', '$1', $word);

        return rtrim($word, 'es') === '' ? $word : rtrim($word, 'es');
    }

    private static function isSubsequence(string $needle, string $haystack): bool
    {
        $at = 0;
        foreach (str_split($needle) as $letter) {
            $found = strpos($haystack, $letter, $at);
            if ($found === false) {
                return false;
            }
            $at = $found + 1;
        }

        return true;
    }

    /** Distance de Damerau (alignement optimal) entre deux mots ASCII. */
    private static function distance(string $a, string $b): int
    {
        $la = strlen($a);
        $lb = strlen($b);
        $d = [];
        for ($x = 0; $x <= $la; $x++) {
            $d[$x][0] = $x;
        }
        for ($y = 0; $y <= $lb; $y++) {
            $d[0][$y] = $y;
        }
        for ($x = 1; $x <= $la; $x++) {
            for ($y = 1; $y <= $lb; $y++) {
                $d[$x][$y] = min($d[$x - 1][$y] + 1, $d[$x][$y - 1] + 1, $d[$x - 1][$y - 1] + ($a[$x - 1] === $b[$y - 1] ? 0 : 1));
                if ($x > 1 && $y > 1 && $a[$x - 1] === $b[$y - 2] && $a[$x - 2] === $b[$y - 1]) {
                    $d[$x][$y] = min($d[$x][$y], $d[$x - 2][$y - 2] + 1);
                }
            }
        }

        return $d[$la][$lb];
    }

    /** Au moins une lettre, au plus 80 caractères, pas que des chiffres. */
    private static function wellFormed(string $alias): bool
    {
        return mb_strlen($alias) <= 80 && mb_strlen(str_replace(' ', '', $alias)) >= 2 && preg_match('/[a-z]/', $alias) === 1;
    }

    /**
     * Les preuves d'une écriture : les saisies reçues qui la portent, en mots entiers. `null` si aucune — le modèle l'a
     * inventée.
     *
     * @param  list<array{q: string, visitors: int}>  $queries
     * @return array{visitors: int, queries: int, period: array{from: string, to: string}}|null
     */
    private static function evidence(string $alias, array $queries): ?array
    {
        $visitors = 0;
        $count = 0;
        foreach ($queries as $query) {
            if (str_contains(' '.CleDeQuartier::de($query['q']).' ', ' '.$alias.' ')) {
                $visitors += $query['visitors'];
                $count++;
            }
        }
        if ($count === 0) {
            return null;
        }

        return [
            'visitors' => $visitors,
            'queries' => $count,
            'period' => ['from' => now()->subDays(self::WINDOW_DAYS - 1)->toDateString(), 'to' => now()->toDateString()],
        ];
    }

    /** @return array{outcome: string, created: int, updated: int, discarded: list<array{alias: string, code: string}>} */
    /**
     * @param  array{outcome: string, created: int, updated: int, discarded: list<array{alias: string, code: string}>}  $result
     * @return array{outcome: string, created: int, updated: int, discarded: list<array{alias: string, code: string}>}
     */
    private function finish(array $result): array
    {
        SearchAliasSetting::current();
        SearchAliasSetting::query()->whereKey(SearchAliasSetting::ID)->update(['last_run_at' => now(), 'last_run_outcome' => $result['outcome']]);

        return $result;
    }

    private static function result(string $outcome): array
    {
        return ['outcome' => $outcome, 'created' => 0, 'updated' => 0, 'discarded' => []];
    }
}
