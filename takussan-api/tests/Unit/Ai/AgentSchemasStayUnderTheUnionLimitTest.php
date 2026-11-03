<?php

namespace Tests\Unit\Ai;

use App\Ai\Agents\RadarExtraction;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Laravel\Ai\Gateway\Anthropic\AnthropicSchemaSanitizer;
use Laravel\Ai\ObjectSchema;
use PHPUnit\Framework\TestCase;
use Tests\Support\Ai\AgentSchemas;

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
 *
 * Elle vaut pour tous les agents, stricts ou non (TCK-2433, `SocleAgent::usesStrictSchema()`) : la limite ne
 * frappe qu'un schéma strict, mais un agent qui le redevient la retrouve. Sa voisine
 * `StrictSchemasStayWithinTheAttestedSizeTest` garde la grammaire compilée, que ce décompte ne voit pas.
 *
 * TCK-2449 — elle mesure chaque pilote attesté (`AgentSchemas::ATTESTED_DRIVERS`), avec la limite de ce pilote.
 */
class AgentSchemasStayUnderTheUnionLimitTest extends TestCase
{
    public function test_chaque_agent_a_sortie_structuree_reste_sous_la_limite_de_chaque_pilote_atteste(): void
    {
        $agents = AgentSchemas::structuredAgents();

        // Témoin : la découverte trouve bien les agents livrés, une garde vide ne passe pas.
        $this->assertContains(RadarExtraction::class, $agents);
        $this->assertArrayHasKey('anthropic', AgentSchemas::ATTESTED_DRIVERS);
        foreach (AgentSchemas::ATTESTED_DRIVERS as $driver => $limits) {
            foreach ($agents as $agent) {
                $unions = AgentSchemas::unionCount(AgentSchemas::asSentBy($agent, $driver));
                $this->assertLessThanOrEqual($limits['max_unions'], $unions, "{$agent} : {$unions} paramètres à union, {$driver} en refuse plus de {$limits['max_unions']}");
            }
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

        $this->assertSame(4, AgentSchemas::unionCount($schema));
        // Un `type` en tableau (forme d'avant le sanitizer) compte aussi, un type unique non.
        $this->assertSame(1, AgentSchemas::unionCount(['properties' => ['a' => ['type' => ['string', 'null']], 'b' => ['type' => ['string']]]]));
    }
}
