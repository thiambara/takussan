<?php

namespace Tests\Support\Ai;

use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Gateway\Anthropic\AnthropicSchemaSanitizer;
use Laravel\Ai\ObjectSchema;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;

/**
 * TCK-2411, TCK-2433 — les schémas des agents tels que laravel/ai les envoie à Anthropic en sortie
 * structurée native (`AnthropicSchemaSanitizer::sanitize((new ObjectSchema(…))->toSchema())`,
 * `Gateway\Anthropic\Concerns\BuildsTextRequests::buildTextRequestBody()`), et leurs mesures. Lu par
 * les gardes `AgentSchemasStayUnderTheUnionLimitTest` et `StrictSchemasStayWithinTheAttestedSizeTest`.
 */
final class AnthropicSchemas
{
    /** @return list<class-string> les agents concrets à sortie structurée de `app/Ai/Agents/`, découverts sur le disque */
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
        sort($agents);

        return $agents;
    }

    /** @param  class-string  $agent */
    public static function agent(string $agent): HasStructuredOutput
    {
        return (new ReflectionClass($agent))->newInstanceWithoutConstructor();
    }

    /**
     * @param  class-string  $agent
     * @return array<string, mixed>
     */
    public static function forAnthropic(string $agent): array
    {
        return AnthropicSchemaSanitizer::sanitize((new ObjectSchema(self::agent($agent)->schema(new JsonSchemaTypeFactory)))->toSchema());
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
