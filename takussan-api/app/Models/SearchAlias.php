<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\SearchAliasOrigin;
use App\Models\Enums\SearchAliasStatus;
use App\Models\Enums\SearchAliasTargetKind;
use App\Services\Search\Aliases\SearchAliasCurator;
use App\Services\Search\Query\DatabasePlaceLexicon;
use App\Services\Search\Query\DatabaseVocabularyAliases;
use App\Support\Search\CleDeQuartier;
use Illuminate\Support\Facades\Cache;

/**
 * TCK-2476 (ADR-0088 §7) — une variante d'écriture de la recherche : « wakam » désigne le quartier Ouakam, « apparts » le
 * type `apartment`. Proposée par l'usage `search.variantes` ({@see SearchAliasCurator}), ou tranchée par un opérateur
 * (`PATCH /api/admin/search/aliases/{alias}` : elle devient `manual`, et l'IA ne la touche plus).
 *
 * Une variante `active` est comprise par l'analyse de la saisie ({@see DatabasePlaceLexicon} pour les lieux,
 * {@see DatabaseVocabularyAliases} pour les types et les termes) et trouvée dans l'index des suggestions. Une variante
 * dont la cible a disparu du référentiel n'est plus lue : elle ne désigne plus rien.
 */
class SearchAlias extends AbstractModel
{
    protected $fillable = [
        'alias', 'target_kind', 'target_value', 'target_city', 'origin', 'status', 'evidence',
    ];

    protected $casts = [
        'target_kind' => SearchAliasTargetKind::class,
        'origin' => SearchAliasOrigin::class,
        'status' => SearchAliasStatus::class,
        'evidence' => 'array',
    ];

    protected static array $requestFilterable = ['status', 'origin', 'target_kind'];

    protected static array $requestSortable = ['id', 'alias', 'created_at', 'updated_at'];

    protected static array $queryFields = [
        'id', 'alias', 'target_kind', 'target_value', 'target_city', 'origin', 'status', 'evidence', 'created_at', 'updated_at',
    ];

    /** La forme repliée d'une écriture, celle de la colonne `alias` : `null` si rien n'en reste. */
    public static function fold(string $alias): ?string
    {
        return CleDeQuartier::de($alias);
    }

    /** Une variante écrite ou tranchée se lit dès la requête suivante : les deux caches de l'analyse sont vidés. */
    public static function forgetCaches(): void
    {
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);
        Cache::forget(DatabaseVocabularyAliases::CACHE_KEY);
    }
}
