<?php

namespace App\Ai\Agents;

use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasProviderOptions;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Enums\Lab;
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
abstract class SocleAgent implements Agent, HasProviderOptions
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
     * TCK-2449 (ADR-0085 §2) — les pilotes sur lesquels un vrai appel a attesté le mode strict de cet agent.
     * `anthropic` seul aujourd'hui. Ajouter un pilote demande d'abord cette attestation, puis la ligne de ses
     * limites dans `Tests\Support\Ai\AgentSchemas::ATTESTED_DRIVERS`.
     *
     * @return list<string>
     */
    protected function strictDrivers(): array
    {
        return [Lab::Anthropic->value];
    }

    /**
     * TCK-2433, TCK-2449 — sur ce PILOTE (jamais le nom d'une entrée), la sortie structurée passe-t-elle par
     * le mode STRICT du fournisseur (Anthropic : `output_config.format`, une grammaire compilée qui contraint
     * le décodage) ? Faux : le modèle suit le schéma sans garantie, le code qui lit la sortie doit tout
     * valider, et une réponse sans sortie est un échec du maillon. C'est un choix déclaré, jamais un repli à
     * l'exécution. Anthropic refuse une grammaire trop grosse sans en publier le seuil
     * (`StrictSchemasStayWithinTheAttestedSizeTest`).
     *
     * ⚠ Déclarer ici un pilote de la famille OpenAI ne suffirait pas : `openai`, `openrouter` et
     * `openai-compatible` n'envoient `strict: true` que sous l'attribut `#[Strict]` du SDK, qui vaut pour tous
     * les pilotes de l'agent à la fois.
     */
    public function usesStrictSchema(string $driver): bool
    {
        return in_array($driver, $this->strictDrivers(), true);
    }

    /**
     * TCK-2433, TCK-2449 — lu par `TextGenerationOptions` du SDK, et fusionné en dernier dans le corps de la
     * requête. `$provider` vaut le pilote, sauf sur `openai-compatible`, où le SDK passe le nom de l'entrée.
     * Une entrée de ce pilote nommée `anthropic` ne reçoit pourtant rien ici : non stricte, elle est jouée
     * sous son double, dont le nom n'est dans aucune table.
     *
     * Seul le pilote `anthropic` a quelque chose à neutraliser. Sans mode strict, laravel/ai y force l'outil
     * de sortie (`tool_choice` `tool`), qu'Opus 5.5, Sonnet 5.5, Fable 5.1 et Mythos 5.1 refusent en HTTP 400
     * quels que soient les réglages de réflexion, comme la réflexion manuelle sur tout modèle (documentation
     * d'Anthropic, « Forcing tool use »). `auto`, accepté partout, rend le choix au modèle : le prompt et
     * l'outil seul proposé l'y mènent, et la passerelle tient une réponse sans sortie pour un échec
     * (`ai.response_invalid`). Un agent strict ou sans schéma n'ajoute rien : sa requête n'a pas d'outil.
     *
     * `openai`, `openrouter` et `openai-compatible` n'ont pas d'outil de sortie : laravel/ai y demande la
     * sortie par `text.format` ou `response_format`. Sans `tools` dans la requête, il n'y a rien à forcer, et
     * aucun `tool_choice` à poser : la documentation de ces fournisseurs ne dit pas qu'il serait accepté seul.
     *
     * @return array<string, mixed>
     */
    public function providerOptions(Lab|string $provider): array
    {
        $driver = $provider instanceof Lab ? $provider->value : $provider;

        return $driver === Lab::Anthropic->value && $this instanceof HasStructuredOutput && ! $this->usesStrictSchema($driver)
            ? ['tool_choice' => ['type' => 'auto']]
            : [];
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
