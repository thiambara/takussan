<?php

namespace App\Ai\Usages;

use App\Ai\Agents\SearchAliasProposals;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;
use App\Services\Search\Aliases\SearchAliasCurator;

/**
 * TCK-2476 (ADR-0088 §7) — tenir chaque semaine les variantes d'écriture de la recherche (« wakam » → Ouakam,
 * « apparts » → appartement) à partir des recherches sans résultat ({@see SearchAliasCurator}).
 *
 * - Classe `publique` : l'entrée est faite de saisies NORMALISÉES du journal anonyme, qui ont déjà passé les exclusions
 *   d'ADR-0088 §3 (ni `@`, ni six chiffres, au plus 80 caractères) et portées par au moins deux visiteurs distincts, et
 *   des listes du référentiel (lieux, types, termes). Ni compte, ni identifiant, ni IP.
 * - Aucun contenu externe : le journal est écrit par le code de la recherche publique.
 * - Jugé au nom d'un `super_admin` (`platform.settings.manage` : régler la plateforme), comme les routes qui tranchent
 *   les variantes.
 * - Plafond modeste : un passage par semaine, et aucun appel quand les saisies n'ont pas changé.
 * - Aucun cache : l'empreinte des saisies tient lieu de cache, côté code.
 */
final class SearchAliasesUsage implements AiUsage
{
    public const KEY = 'search.variantes';

    public function key(): string
    {
        return self::KEY;
    }

    public function role(): AiModelRole
    {
        return AiModelRole::Extraction;
    }

    public function agentClass(): string
    {
        return SearchAliasProposals::class;
    }

    public function promptVersion(): int
    {
        return 1;
    }

    public function maxDataClass(): AiDataClass
    {
        return AiDataClass::Publique;
    }

    public function authority(): Capability|PlatformAbility
    {
        return PlatformAbility::SettingsManage;
    }

    public function dailyBudgetUsd(): ?string
    {
        return '0.25';
    }

    public function cacheTtlSeconds(): int
    {
        return 0;
    }

    public function readsExternalContent(): bool
    {
        return false;
    }
}
