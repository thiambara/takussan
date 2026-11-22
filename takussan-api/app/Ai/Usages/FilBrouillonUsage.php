<?php

namespace App\Ai\Usages;

use App\Ai\Agents\FilBrouillon;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/**
 * TCK-2975 (ADR-0131 §§ 2, 3) — le brouillon d'une réponse, pour le seul personnel de l'agence qui le demande.
 * Rien n'est envoyé : le texte n'est publié que par la route ordinaire des messages, au geste du lecteur.
 *
 * - **Sans notes d'équipe** : le brouillon partira au fil entier, son entrée ne lit que les messages `all`
 *   (`LectureDuFilPourIa::lire(avecNotes: false)`).
 * - Classe `personnelle`, contenu externe (`ExternalContent::wrap()`), aucun cache, autorité
 *   `messaging.copilot` : comme `fil.resume`.
 */
final class FilBrouillonUsage implements AiUsage
{
    public const KEY = 'fil.brouillon';

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
        return FilBrouillon::class;
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
