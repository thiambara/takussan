<?php

namespace Tests\Support\Ai;

use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;
use App\Services\Ai\AttachmentsUseVision;

/** Un usage d'essai `extraction` dont les pièces jointes passent par le rôle `vision`. */
final class UsageVisionDEssai implements AiUsage, AttachmentsUseVision
{
    public const KEY = 'essai.vision';

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
