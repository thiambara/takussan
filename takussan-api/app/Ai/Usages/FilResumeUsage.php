<?php

namespace App\Ai\Usages;

use App\Ai\Agents\FilResume;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/**
 * TCK-2974 (ADR-0131 § 3) — « Ce que vous avez manqué » : le résumé d'un fil chargé, pour le seul personnel
 * de l'agence qui le demande.
 *
 * - Classe `personnelle` : les noms des participants arrivent au modèle ; téléphones et adresses
 *   électroniques sont masqués par `LectureDuFilPourIa`, la donnée `sensible` tenue dehors par la projection
 *   fermée des objets (ADR-0131 § 2).
 * - Contenu externe (ADR-0076 §10) : les messages sont écrits par les participants, reçus par
 *   `ExternalContent::wrap()`, agent sans outil, sortie structurée.
 * - Aucune pièce jointe, aucun cache : un usage non public n'y entre jamais.
 * - Autorité : la capacité d'agence `messaging.copilot`, jugée pour l'agence du fil (`AiAuthority`).
 */
final class FilResumeUsage implements AiUsage
{
    public const KEY = 'fil.resume';

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
        return FilResume::class;
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
        return Capability::MessagingCopilot;
    }

    public function dailyBudgetUsd(): ?string
    {
        return '1.00';
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
