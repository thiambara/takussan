<?php

namespace App\Ai\Agents;

use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Promptable;

/**
 * TCK-2383 (ADR-0076) — la base de tout agent du socle. Ni prompt ni paramètre en dur : la
 * passerelle pose, avant chaque appel, le prompt versionné de l'usage et le `max_tokens` du maillon
 * joué. Un agent ne s'appelle jamais hors de `AiGateway`.
 */
abstract class SocleAgent implements Agent
{
    use Promptable;

    private string $instructions = '';

    private ?int $maxTokens = null;

    public function configure(string $instructions, ?int $maxTokens): static
    {
        $this->instructions = $instructions;
        $this->maxTokens = $maxTokens;

        return $this;
    }

    public function instructions(): string
    {
        return $this->instructions;
    }

    /** Lu par `TextGenerationOptions` du SDK. */
    public function maxTokens(): ?int
    {
        return $this->maxTokens;
    }

    /**
     * Lu par `Promptable::getTimeout()` du SDK, qui sinon retombe sur 60 s. Une valeur absente,
     * non numérique ou nulle ne désarme jamais le délai : défaut de la configuration.
     */
    public function timeout(): int
    {
        $secondes = (int) config('ai.timeout_seconds');

        return $secondes > 0 ? $secondes : 300;
    }
}
