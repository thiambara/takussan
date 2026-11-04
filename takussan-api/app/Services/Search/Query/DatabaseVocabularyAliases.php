<?php

namespace App\Services\Search\Query;

use App\Models\Enums\PropertyType;
use App\Models\Enums\SearchAliasStatus;
use App\Models\Enums\SearchAliasTargetKind;
use App\Models\SearchAlias;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

/**
 * TCK-2476 (ADR-0088 §7) — les variantes ACTIVES d'un type de bien ou d'un terme (`search_aliases`), traduites en
 * critères du parseur. Une variante dont la cible n'existe plus (un type retiré de `PropertyType`, un terme sorti du
 * vocabulaire de {@see SearchQueryParser}) n'est pas lue.
 *
 * En cache {@see self::TTL} secondes sous {@see self::CACHE_KEY}, comme {@see DatabasePlaceLexicon} ; une écriture de
 * variante vide les deux caches (`SearchAlias::forgetCaches()`).
 */
final class DatabaseVocabularyAliases implements VocabularyAliases
{
    public const CACHE_KEY = 'search.vocabulary_aliases.v1';

    public const TTL = 600;

    /** @var list<array{alias: string, key: string, value: string|bool}>|null */
    private ?array $entries = null;

    public function __construct(private readonly CacheRepository $cache) {}

    public function entries(): array
    {
        return $this->entries ??= $this->cache->remember(self::CACHE_KEY, self::TTL, fn (): array => $this->load());
    }

    /** @return list<array{alias: string, key: string, value: string|bool}> */
    public function load(): array
    {
        $entries = [];
        $rows = SearchAlias::query()
            ->where('status', SearchAliasStatus::Active->value)
            ->whereIn('target_kind', [SearchAliasTargetKind::PropertyType->value, SearchAliasTargetKind::Term->value])
            ->orderBy('id')
            ->get(['alias', 'target_kind', 'target_value']);

        foreach ($rows as $row) {
            $criterion = $row->target_kind === SearchAliasTargetKind::PropertyType
                ? (PropertyType::tryFrom($row->target_value) !== null ? ['key' => 'type', 'value' => $row->target_value] : null)
                : SearchQueryParser::termEntry($row->target_value);
            if ($criterion !== null) {
                $entries[] = ['alias' => (string) $row->alias, ...$criterion];
            }
        }

        return $entries;
    }
}
