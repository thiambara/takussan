<?php

namespace App\Ai\Usages;

use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiGateway;
use App\Services\Ai\TranscriptionUsage;
use LogicException;

/**
 * TCK-2976 (ADR-0131 § 7) — la transcription d'une note vocale du fil, pour le seul personnel de l'agence.
 *
 * - Rôle `transcription`, vide par défaut : sans fournisseur qui transcrit, la fonction n'est pas servie
 *   (`ReglagesDuCopilote::etat()` → `non_configuree`), et rien ne part.
 * - Classe `personnelle` : la voix d'un participant. Aucun cache.
 * - Ni agent ni prompt : le fournisseur rend du texte, aucune consigne ne s'y exécute ; `promptVersion()` porte la
 *   version de cette composition dans le journal.
 * - Autorité : la capacité d'agence `messaging.copilot`, jugée pour l'agence du fil (`AiAuthority`).
 */
final class FilTranscriptionUsage implements TranscriptionUsage
{
    public const KEY = 'fil.transcription';

    public function key(): string
    {
        return self::KEY;
    }

    public function role(): AiModelRole
    {
        return AiModelRole::Transcription;
    }

    public function agentClass(): string
    {
        throw new LogicException('Un usage de transcription se joue par '.AiGateway::class.'::transcribe().');
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
        return '0.50';
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
