<?php

namespace App\Services\Search\Aliases;

use App\Ai\Usages\SearchAliasesUsage;
use App\Models\AiCall;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyType;
use App\Models\Enums\SearchAliasOrigin;
use App\Models\Enums\SearchAliasStatus;
use App\Models\Enums\SearchAliasTargetKind;
use App\Models\Profiles\PlatformProfile;
use App\Models\SearchAlias;
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
 *  1. **Au nom d'un `super_admin`** : celui que la commande désigne (`--operator`), sinon le plus ancien `super_admin`
 *     actif qui peut régler la plateforme. Aucun → aucun signal lu, aucun appel.
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
 *     - confiance sous {@see self::MIN_CONFIDENCE}, ou au-delà de {@see self::MAX_PER_RUN} créations : écartée.
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

    public const OUTCOME_NO_OPERATOR = 'search.aliases.no_operator';

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
     * Un passage.
     *
     * @return array{outcome: string, created: int, updated: int, discarded: list<array{alias: string, code: string}>}
     */
    public function run(?User $operator = null): array
    {
        $operator ??= self::defaultOperator();
        if ($operator === null) {
            return self::result(self::OUTCOME_NO_OPERATOR);
        }

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

    /** Le plus ancien `super_admin` actif qui peut régler la plateforme, ou `null`. */
    public static function defaultOperator(): ?User
    {
        return PlatformProfile::query()->active()
            ->where('level', PlatformProfileLevel::SuperAdmin->value)
            ->orderBy('granted_at')->orderBy('id')
            ->with('user')
            ->get()
            ->map(fn (PlatformProfile $profile): ?User => $profile->user)
            ->first(fn (?User $user): bool => $user?->hasPlatformAbility(PlatformAbility::SettingsManage) === true);
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
    private static function result(string $outcome): array
    {
        return ['outcome' => $outcome, 'created' => 0, 'updated' => 0, 'discarded' => []];
    }
}
