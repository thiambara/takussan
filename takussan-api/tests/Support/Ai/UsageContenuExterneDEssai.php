<?php

namespace Tests\Support\Ai;

use App\Ai\Agents\SocleAgent;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/** Un usage qui lit un contenu externe (ADR-0076 §10), avec l'agent qu'on lui donne. */
final class UsageContenuExterneDEssai implements AiUsage
{
    /** @param  class-string<SocleAgent>  $agent */
    public function __construct(private readonly string $agent = AgentDEssai::class) {}

    public function key(): string
    {
        return 'essai.contenu_externe';
    }

    public function role(): AiModelRole
    {
        return AiModelRole::Extraction;
    }

    public function agentClass(): string
    {
        return $this->agent;
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
        return 0;
    }

    public function readsExternalContent(): bool
    {
        return true;
    }
}
