<?php

namespace App\Services\Ai;

use App\Ai\Agents\SocleAgent;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-2383 (ADR-0076 §4) — ce qu'une fonctionnalité déclare pour utiliser un modèle. Elle n'appelle
 * jamais un agent elle-même : elle passe une `AiRequest` à `AiGateway`, qui lit tout le reste ici.
 */
interface AiUsage
{
    /** Clé stable `<domaine>.<usage>`, inscrite sur chaque ligne de `ai_calls`. */
    public function key(): string;

    public function role(): AiModelRole;

    /** @return class-string<SocleAgent> */
    public function agentClass(): string;

    /** Version chargée sous `resources/ai/prompts/<clé>/v<N>.md`. */
    public function promptVersion(): int;

    /** La classe de données la plus haute que l'usage peut envoyer ; jamais `Sensible`. */
    public function maxDataClass(): AiDataClass;

    /** Ce que l'appelant doit détenir : une capacité d'agence ou un geste plateforme. */
    public function authority(): Capability|PlatformAbility;

    /** Plafond journalier par défaut, en XOF ; `ai_usage_settings` le remplace. `null` : aucun. */
    public function dailyBudgetXof(): ?float;

    /** Durée du cache par empreinte, en secondes ; 0 le désactive. */
    public function cacheTtlSeconds(): int;

    /**
     * Vrai si l'usage lit un contenu venu de l'extérieur (annonce, capture, message) : il le reçoit
     * par `ExternalContent::wrap()`, n'a aucun outil et rend une sortie structurée (ADR-0076 §10,
     * `ExternalContentPolicy`).
     */
    public function readsExternalContent(): bool;
}
