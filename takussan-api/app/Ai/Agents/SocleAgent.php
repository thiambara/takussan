<?php

namespace App\Ai\Agents;

use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Promptable;

/**
 * TCK-2383 (ADR-0076) — la base de tout agent du socle. Ni prompt ni paramètre en dur : la
 * passerelle pose, avant chaque appel, le prompt versionné de l'usage et le `max_tokens` du maillon
 * joué. Un agent ne s'appelle jamais hors de `AiGateway`.
 *
 * L'agent d'un usage qui lit un contenu externe (ADR-0076 §10) n'implémente ni `HasTools` ni
 * `HasSkills` et rend une sortie structurée ; il reçoit ce contenu par `ExternalContent::wrap()`.
 * `ExternalContentPolicy` le tient.
 */
abstract class SocleAgent implements Agent
{
    use Promptable;

    /** Au-delà, un appel bloqué occuperait son worker sans fin raisonnable. */
    public const MAX_TIMEOUT_SECONDS = 900;

    private string $instructions = '';

    private ?int $maxTokens = null;

    private int $chainLength = 1;

    /**
     * `$chainLength` : le nombre de maillons de la chaîne que la passerelle joue pour cet appel
     * (TCK-2386). Un agent dont le temps d'appel est borné par celui d'un job le partage entre eux
     * ({@see RadarExtraction::timeout()}) ; les autres l'ignorent.
     */
    public function configure(string $instructions, ?int $maxTokens, int $chainLength = 1): static
    {
        $this->instructions = $instructions;
        $this->maxTokens = $maxTokens;
        $this->chainLength = max(1, $chainLength);

        return $this;
    }

    /** Le nombre de maillons de la chaîne jouée, au moins un. */
    public function chainLength(): int
    {
        return $this->chainLength;
    }

    public function instructions(): string
    {
        return $this->instructions;
    }

    /**
     * TCK-2433 — la sortie structurée passe-t-elle par le mode STRICT du fournisseur (Anthropic :
     * `output_config.format`, une grammaire compilée qui contraint le décodage) ? Faux : la passerelle
     * la demande par un outil forcé non strict (`output_structured_data`), sans grammaire — le modèle
     * suit le schéma sans garantie, et le code qui lit la sortie doit tout valider. Anthropic refuse une
     * grammaire trop grosse sans en publier le seuil (`AgentSchemasStayUnderTheUnionLimitTest`).
     */
    public function usesStrictSchema(): bool
    {
        return true;
    }

    /** Lu par `TextGenerationOptions` du SDK. */
    public function maxTokens(): ?int
    {
        return $this->maxTokens;
    }

    /**
     * Lu par `Promptable::getTimeout()` du SDK, qui sinon retombe sur 60 s. Une valeur absente,
     * non numérique ou nulle ne désarme jamais le délai : défaut de la configuration. Une valeur
     * démesurée est ramenée au plafond.
     *
     * ⚠ Ce délai ne protège rien de ce qui coupe avant lui : une requête web (60 s, `docker/php.ini`)
     * ou le `$timeout` du job qui porte l'appel. Voir `config/ai.php`.
     */
    public function timeout(): int
    {
        $secondes = (int) config('ai.timeout_seconds');

        return $secondes > 0 ? min($secondes, self::MAX_TIMEOUT_SECONDS) : 300;
    }
}
