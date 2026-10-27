<?php

namespace App\Ai\Usages;

use App\Ai\Agents\ConnectionTestAgent;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/**
 * TCK-2385 (ADR-0076 §3) — « tester la connexion » d'un fournisseur depuis la console : un appel
 * minimal, sans donnée, journalisé comme tout autre. Le maillon est imposé par la requête.
 */
final class ConnectionTestUsage implements AiUsage
{
    public const KEY = 'socle.test_connexion';

    public function key(): string
    {
        return self::KEY;
    }

    public function role(): AiModelRole
    {
        return AiModelRole::Redaction;
    }

    public function agentClass(): string
    {
        return ConnectionTestAgent::class;
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
        return PlatformAbility::AiManage;
    }

    public function dailyBudgetXof(): ?float
    {
        return 100.0;
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
