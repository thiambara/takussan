<?php

namespace Tests\Unit\Ai;

use App\Ai\Agents\RadarExtraction;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Gateway\Anthropic\AnthropicSchemaSanitizer;
use Laravel\Ai\ObjectSchema;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;

/**
 * TCK-2411 — Anthropic refuse (HTTP 400) un schéma de sortie structurée qui compte plus de 16
 * paramètres à union (« 29 parameters with type arrays or anyOf … limit: 16 ») : le refus tombe
 * avant le modèle, et aucun test qui simule le modèle ne le voit. `radar.extraction` en a vécu :
 * toute extraction réelle échouait en `ai.request_rejected`.
 *
 * La garde sérialise le schéma de CHAQUE agent à sortie structurée de `app/Ai/Agents/` (découvert
 * par le système de fichiers : un agent neuf est couvert sans inscription) sous la forme exacte que
 * laravel/ai envoie à Anthropic — `AnthropicSchemaSanitizer::sanitize((new ObjectSchema(…))->toSchema())`,
 * `Gateway\Anthropic\Concerns\BuildsTextRequests::buildTextRequestBody()` —, puis compte les nœuds à
 * `type` multiple ou à `anyOf`. Ce décompte rend 29 sur le schéma refusé, le chiffre de l'API.
 */
class AgentSchemasStayUnderTheUnionLimitTest extends TestCase
{
    /** La limite annoncée par Anthropic dans son refus du 2026-10-29. */
    public const ANTHROPIC_UNION_LIMIT = 16;

    public function test_chaque_agent_a_sortie_structuree_reste_sous_la_limite_d_anthropic(): void
    {
        $agents = self::structuredAgents();

        // Témoin : la découverte trouve bien les agents livrés, une garde vide ne passe pas.
        $this->assertContains(RadarExtraction::class, $agents);
        foreach ($agents as $agent) {
            $unions = self::unionCount(self::anthropicSchema($agent));
            $this->assertLessThanOrEqual(self::ANTHROPIC_UNION_LIMIT, $unions, "{$agent} : {$unions} paramètres à union, Anthropic en refuse plus de ".self::ANTHROPIC_UNION_LIMIT);
        }
    }

    public function test_le_decompte_lit_les_unions_sous_leurs_deux_ecritures_a_toute_profondeur(): void
    {
        $factory = new JsonSchemaTypeFactory;
        $schema = AnthropicSchemaSanitizer::sanitize((new ObjectSchema([
            'a' => $factory->string()->nullable()->required(),
            'b' => $factory->string()->enum(['x', 'y'])->nullable()->required(),
            'c' => $factory->object([
                'd' => $factory->integer()->nullable()->required(),
                'e' => $factory->string()->required(),
            ])->required(),
            'f' => $factory->array()->items($factory->object(['g' => $factory->number()->nullable()->required()]))->required(),
            'h' => $factory->string()->required(),
        ]))->toSchema());

        $this->assertSame(4, self::unionCount($schema));
        // Un `type` en tableau (forme d'avant le sanitizer) compte aussi, un type unique non.
        $this->assertSame(1, self::unionCount(['properties' => ['a' => ['type' => ['string', 'null']], 'b' => ['type' => ['string']]]]));
    }

    /** @return list<class-string> les agents concrets à sortie structurée de `app/Ai/Agents/` */
    private static function structuredAgents(): array
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

    /**
     * @param  class-string  $agent
     * @return array<string, mixed>
     */
    private static function anthropicSchema(string $agent): array
    {
        /** @var HasStructuredOutput $instance */
        $instance = (new ReflectionClass($agent))->newInstanceWithoutConstructor();

        return AnthropicSchemaSanitizer::sanitize((new ObjectSchema($instance->schema(new JsonSchemaTypeFactory)))->toSchema());
    }

    /** @param  array<mixed>  $node */
    private static function unionCount(array $node): int
    {
        $count = (is_array($node['type'] ?? null) && count(array_unique($node['type'])) > 1) || isset($node['anyOf']) ? 1 : 0;
        foreach ($node as $child) {
            if (is_array($child)) {
                $count += self::unionCount($child);
            }
        }

        return $count;
    }
}
