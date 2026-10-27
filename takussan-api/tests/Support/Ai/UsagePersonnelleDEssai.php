<?php

namespace Tests\Support\Ai;

use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/** Un usage d'essai `personnelle` avec cache : la passerelle ne doit jamais le mettre en cache. */
final class UsagePersonnelleDEssai implements AiUsage
{
    public const KEY = 'essai.personnelle';

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
        return AiDataClass::Personnelle;
    }

    public function authority(): Capability|PlatformAbility
    {
        return PlatformAbility::ConsoleAccess;
    }

    public function dailyBudgetXof(): ?float
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
