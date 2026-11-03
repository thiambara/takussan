<?php

namespace App\Ai\Usages;

use App\Ai\Agents\RadarConsentMessage;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/**
 * TCK-2388 (ADR-0077 §4) — écrire la salutation et le résumé du message d'accord à un annonceur.
 *
 * - Classe `personnelle` : le nom de l'annonceur arrive au modèle.
 * - Contenu externe (ADR-0076 §10) : le nom et les titres viennent d'une annonce collectée, reçus par
 *   `ExternalContent::wrap()`, agent sans outil.
 * - Aucune pièce jointe (pas de `AttachmentsUseVision`), aucun cache : un usage non public n'y entre jamais.
 * - Les clauses ne sont pas générées : elles sont du texte du dépôt (`ConsentMessageComposer`).
 */
final class RadarConsentMessageUsage implements AiUsage
{
    public const KEY = 'radar.message_accord';

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
        return RadarConsentMessage::class;
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

    public function dailyBudgetUsd(): ?string
    {
        return '0.50';
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
