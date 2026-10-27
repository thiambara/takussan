<?php

namespace Tests\Support\Ai;

use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/** Un usage d'essai à capacité (`properties.create`) : l'agence demandée est la frontière d'isolation (ADR-0076 §9). */
final class UsageAgenceDEssai implements AiUsage
{
    public const KEY = 'essai.agence';

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
        return AgentDEssai::class;
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
        return Capability::PropertiesCreate;
    }

    public function dailyBudgetXof(): ?float
    {
        return null;
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
