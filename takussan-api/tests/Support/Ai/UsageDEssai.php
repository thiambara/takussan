<?php

namespace Tests\Support\Ai;

use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/** L'usage d'essai du socle : rôle `extraction`, données publiques, cache d'une heure. */
final class UsageDEssai implements AiUsage
{
    public const KEY = 'essai.extraction';

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
        return PlatformAbility::ConsoleAccess;
    }

    public function dailyBudgetUsd(): ?string
    {
        return null;
    }

    public function cacheTtlSeconds(): int
    {
        return 3600;
    }

    public function readsExternalContent(): bool
    {
        return false;
    }
}
