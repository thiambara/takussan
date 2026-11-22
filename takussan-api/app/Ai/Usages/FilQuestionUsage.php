<?php

namespace App\Ai\Usages;

use App\Ai\Agents\FilQuestion;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/**
 * TCK-2975 (ADR-0131 §§ 2, 3) — « Demander au fil » : une question du personnel sur CE fil, et une réponse
 * sourcée. Notes d'équipe COMPRISES (le demandeur les lit) ; la question est une saisie du lecteur, délimitée à
 * part du fil. Classe `personnelle`, contenu externe, aucun cache, autorité `messaging.copilot`.
 */
final class FilQuestionUsage implements AiUsage
{
    public const KEY = 'fil.question';

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
        return FilQuestion::class;
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
