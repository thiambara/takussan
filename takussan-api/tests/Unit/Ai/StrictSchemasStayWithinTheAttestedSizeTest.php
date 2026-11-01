<?php

namespace Tests\Unit\Ai;

use App\Ai\Agents\RadarConsentVerification;
use App\Ai\Agents\RadarExtraction;
use App\Ai\Agents\SocleAgent;
use Laravel\Ai\Enums\Lab;
use PHPUnit\Framework\TestCase;
use Tests\Support\Ai\AgentSchemas;

/**
 * TCK-2433 — sous la limite des 16 unions (TCK-2411), Anthropic a encore refusé le schéma strict de
 * `radar.extraction` : « The compiled grammar is too large » (HTTP 400). Sa documentation des sorties
 * structurées publie trois limites (20 outils stricts, 24 paramètres optionnels, 16 unions) et des
 * « limites internes sur la taille de la grammaire compilée », SANS seuil : unions, objets imbriqués,
 * optionnels et outils y interagissent. Aucune mesure locale ne compile cette grammaire.
 *
 * La garde borne donc un schéma STRICT ({@see SocleAgent::usesStrictSchema()}) par ce qu'un vrai appel
 * a attesté : pas plus de nœuds de schéma que le plus gros schéma strict qu'Anthropic a compilé, et la
 * limite publiée des optionnels. Au-delà, deux issues : attester le schéma par un vrai appel (puis
 * relever `max_nodes`, avec le `request_id`), ou retirer le pilote des `strictDrivers()` de l'agent.
 *
 * Ce qu'elle ne voit pas : un schéma plus petit que le plus gros attesté mais de forme plus coûteuse
 * (unions imbriquées, enums longs, motifs) ; un changement côté Anthropic de ses limites internes ; les
 * outils stricts (aucun agent du socle n'en a, `ExternalContentPolicy`). Les nœuds ne sont qu'un
 * indicateur de taille, calibré sur deux points : un schéma compilé, un schéma refusé.
 */
class StrictSchemasStayWithinTheAttestedSizeTest extends TestCase
{
    /**
     * Le plus gros schéma strict dont la compilation est attestée par un vrai appel sur Anthropic : celui de
     * `RadarConsentVerification` (21 nœuds), joué par l'évaluation de référence `radar.verification_accord`
     * du 2026-10-29 (TCK-2403). Refusé, pour comparaison : `RadarExtraction`, 96 nœuds (2026-10-30,
     * `req_011CgXcoW2oogB57WsCGbQkH`). Lu dans `AgentSchemas::ATTESTED_DRIVERS['anthropic']['max_nodes']`, avec la
     * limite publiée des optionnels, tous schémas stricts d'une requête confondus.
     */
    private const ANTHROPIC = AgentSchemas::ATTESTED_DRIVERS['anthropic'];

    public function test_chaque_schema_strict_reste_dans_la_taille_attestee(): void
    {
        $strictSurUnPilote = [];
        foreach (AgentSchemas::ATTESTED_DRIVERS as $driver => $limits) {
            foreach (AgentSchemas::structuredAgents() as $agent) {
                $instance = AgentSchemas::agent($agent);
                if ($instance instanceof SocleAgent && ! $instance->usesStrictSchema($driver)) {
                    continue;
                }
                $strictSurUnPilote[] = $agent;
                $schema = AgentSchemas::asSentBy($agent, $driver);
                $nodes = AgentSchemas::nodeCount($schema);
                $this->assertLessThanOrEqual($limits['max_nodes'], $nodes, "{$agent} : schéma strict de {$nodes} nœuds sur {$driver}, le plus gros attesté en compte {$limits['max_nodes']} — attester par un vrai appel, ou retirer ce pilote de `strictDrivers()`");
                $this->assertLessThanOrEqual($limits['max_optional'], AgentSchemas::optionalCount($schema), "{$agent} : trop de paramètres optionnels sur {$driver}");
            }
        }

        // Témoin : la garde juge au moins l'agent strict livré, elle ne passe pas à vide.
        $this->assertContains(RadarConsentVerification::class, $strictSurUnPilote);
    }

    /** ADR-0085 §2 — un pilote sans attestation est non strict, pour chaque agent et chaque pilote du SDK. */
    public function test_aucun_agent_n_est_strict_sur_un_pilote_non_atteste(): void
    {
        foreach (AgentSchemas::structuredAgents() as $agent) {
            foreach (Lab::cases() as $lab) {
                if (! array_key_exists($lab->value, AgentSchemas::ATTESTED_DRIVERS)) {
                    $this->assertFalse(AgentSchemas::agent($agent)->usesStrictSchema($lab->value), "{$agent} se déclare strict sur {$lab->value}, sans attestation ni limites");
                }
            }
        }
    }

    public function test_le_schema_refuse_par_anthropic_depasse_la_borne(): void
    {
        // Calibrage : le schéma refusé le 2026-10-30, s'il redevenait strict, rougirait la garde.
        $this->assertGreaterThan(self::ANTHROPIC['max_nodes'], AgentSchemas::nodeCount(AgentSchemas::asSentBy(RadarExtraction::class, 'anthropic')));
        $this->assertSame(self::ANTHROPIC['max_nodes'], AgentSchemas::nodeCount(AgentSchemas::asSentBy(RadarConsentVerification::class, 'anthropic')));
    }

    public function test_les_mesures_comptent_noeuds_et_optionnels(): void
    {
        $schema = [
            'type' => 'object',
            'properties' => [
                'a' => ['anyOf' => [['type' => 'string'], ['type' => 'null']]],
                'b' => ['type' => 'string', 'enum' => ['x', 'y']],
                'c' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => ['d' => ['type' => 'integer']], 'required' => []]],
            ],
            'required' => ['a', 'b'],
        ];

        // racine, a (+ ses deux branches), b, c, items, d
        $this->assertSame(8, AgentSchemas::nodeCount($schema));
        // c à la racine, d dans l'objet des éléments
        $this->assertSame(2, AgentSchemas::optionalCount($schema));
    }
}
