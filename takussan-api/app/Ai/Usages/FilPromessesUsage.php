<?php

namespace App\Ai\Usages;

use App\Ai\Agents\FilPromesses;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/**
 * TCK-2975 (ADR-0131 §§ 2, 3) — les promesses d'un fil (« Je repasse jeudi à 10 h »), proposées au seul
 * personnel qui les demande, prêtes à devenir un engagement par la route du lot 3. Rôle `extraction`.
 *
 * - **Sans notes d'équipe** (`LectureDuFilPourIa::lire(avecNotes: false)`) : le lot 3 refuse une note en source.
 * - Une suggestion PAR promesse, chacune décidée seule ; un message déjà source d'un engagement n'entre pas.
 * - Classe `personnelle`, contenu externe, aucun cache, autorité `messaging.copilot`.
 */
final class FilPromessesUsage implements AiUsage
{
    public const KEY = 'fil.promesses';

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
        return FilPromesses::class;
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
