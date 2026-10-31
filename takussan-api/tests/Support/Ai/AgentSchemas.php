<?php

namespace Tests\Support\Ai;

use App\Services\Ai\AiUsageRegistry;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Illuminate\Support\Arr;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Gateway\Anthropic\AnthropicSchemaSanitizer;
use Laravel\Ai\ObjectSchema;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;

/**
 * TCK-2411, TCK-2433, TCK-2449 — les schémas des agents tels que laravel/ai les envoie à chaque pilote
 * dans son canal de sortie structurée native, et leurs mesures. `SocleAgentProviderOptionsTest` confronte
 * {@see self::asSentBy()} au corps capturé. Lu par les gardes `AgentSchemasStayUnderTheUnionLimitTest` et
 * `StrictSchemasStayWithinTheAttestedSizeTest`.
 */
final class AgentSchemas
{
    /**
     * Les pilotes où un vrai appel a attesté le mode strict, avec les limites qu'on y vérifie. Anthropic :
     * 16 unions et 24 optionnels publiés (« Structured outputs », relevé le 2026-10-31), 21 nœuds attestés
     * (voir `StrictSchemasStayWithinTheAttestedSizeTest`). Un agent qui se déclare strict sur un pilote
     * absent d'ici rougit cette garde.
     *
     * @var array<string, array{max_unions: int, max_optional: int, max_nodes: int}>
     */
    public const ATTESTED_DRIVERS = [
        'anthropic' => ['max_unions' => 16, 'max_optional' => 24, 'max_nodes' => 21],
    ];

    /**
     * Découverts sur le disque, plus ceux que cite un usage du catalogue, où qu'ils soient. Un agent hors du
     * dossier et d'aucun usage ne se voit pas ici : `scripts/check-ai-usages.mjs` (C) le refuse.
     *
     * @return list<class-string> les agents concrets à sortie structurée
     */
    public static function structuredAgents(): array
    {
        $app = dirname(__DIR__, 3).'/app';
        $agents = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($app.'/Ai/Agents')) as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            $class = 'App\\'.str_replace(['/', '.php'], ['\\', ''], substr($file->getPathname(), strlen($app) + 1));
            $reflection = new ReflectionClass($class);
            if ($reflection->isInstantiable() && $reflection->implementsInterface(HasStructuredOutput::class)) {
                $agents[] = $class;
            }
        }
        foreach (AiUsageRegistry::USAGES as $usage) {
            $class = (new $usage)->agentClass();
            if (is_subclass_of($class, HasStructuredOutput::class)) {
                $agents[] = $class;
            }
        }
        $agents = array_values(array_unique($agents));
        sort($agents);

        return $agents;
    }

    /** @param  class-string  $agent */
    public static function agent(string $agent): HasStructuredOutput
    {
        return (new ReflectionClass($agent))->newInstanceWithoutConstructor();
    }

    /**
     * Anthropic : `Gateway\Anthropic\Concerns\BuildsTextRequests::buildTextRequestBody()`, passé au
     * nettoyeur. OpenAI, OpenRouter et OpenAI-compatible : `buildSchemaFormat()` et `buildResponseFormat()`
     * de leurs `BuildsTextRequests`, sans le `name` qu'ils déplacent à côté du schéma.
     *
     * @param  class-string  $agent
     * @return array<string, mixed>
     */
    public static function asSentBy(string $agent, string $driver): array
    {
        $schema = (new ObjectSchema(self::agent($agent)->schema(new JsonSchemaTypeFactory)))->toSchema();

        return match ($driver) {
            'anthropic' => AnthropicSchemaSanitizer::sanitize($schema),
            'openai', 'openrouter', 'openai-compatible' => Arr::except($schema, ['name']),
        };
    }

    /**
     * Les paramètres à union : un nœud à `type` multiple ou à `anyOf`, à toute profondeur.
     *
     * @param  array<mixed>  $node
     */
    public static function unionCount(array $node): int
    {
        $count = (is_array($node['type'] ?? null) && count(array_unique($node['type'])) > 1) || isset($node['anyOf']) ? 1 : 0;
        foreach ($node as $child) {
            if (is_array($child)) {
                $count += self::unionCount($child);
            }
        }

        return $count;
    }

    /**
     * Les nœuds de schéma (porteurs d'un `type` ou d'un `anyOf`, branches d'union comprises), à toute
     * profondeur ; ni les listes `enum` ni `required` n'en sont.
     *
     * @param  array<mixed>  $node
     */
    public static function nodeCount(array $node): int
    {
        $count = ! array_is_list($node) && (isset($node['type']) || isset($node['anyOf'])) ? 1 : 0;
        foreach ($node as $key => $child) {
            if (is_array($child) && $key !== 'enum' && $key !== 'required') {
                $count += self::nodeCount($child);
            }
        }

        return $count;
    }

    /**
     * Les paramètres optionnels : chaque propriété d'un objet absente de son `required`.
     *
     * @param  array<mixed>  $node
     */
    public static function optionalCount(array $node): int
    {
        $count = is_array($node['properties'] ?? null) && ! array_is_list($node['properties'])
            ? count(array_diff(array_keys($node['properties']), (array) ($node['required'] ?? [])))
            : 0;
        foreach ($node as $child) {
            if (is_array($child)) {
                $count += self::optionalCount($child);
            }
        }

        return $count;
    }
}
