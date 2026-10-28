<?php

namespace App\Ai\Usages;

use App\Ai\Agents\RadarExtraction;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;
use App\Services\Ai\AttachmentsUseVision;

/**
 * TCK-2386 (ADR-0077 §5) — lire une annonce collectée par le Radar et en proposer les champs.
 *
 * - Classe `personnelle` : la passerelle ne masque pas les numéros, l'extraction doit les lire.
 * - Contenu externe (ADR-0076 §10) : reçu par `ExternalContent::wrap()`, agent sans outil.
 * - Des captures jointes passent par le rôle `vision` (`AttachmentsUseVision`).
 * - Aucun cache : un usage non public n'y entre jamais, et chaque annonce est lue une fois.
 */
final class RadarExtractionUsage implements AiUsage, AttachmentsUseVision
{
    public const KEY = 'radar.extraction';

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
        return RadarExtraction::class;
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
        return PlatformAbility::RadarOperate;
    }

    public function dailyBudgetXof(): ?float
    {
        return 2000.0;
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
