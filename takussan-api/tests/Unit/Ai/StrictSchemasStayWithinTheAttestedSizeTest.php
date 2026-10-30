<?php

namespace Tests\Unit\Ai;

use App\Ai\Agents\RadarConsentVerification;
use App\Ai\Agents\RadarExtraction;
use App\Ai\Agents\SocleAgent;
use PHPUnit\Framework\TestCase;
use Tests\Support\Ai\AnthropicSchemas;

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
 * relever la constante, avec le `request_id`), ou passer l'agent en sortie par outil.
 *
 * Ce qu'elle ne voit pas : un schéma plus petit que le plus gros attesté mais de forme plus coûteuse
 * (unions imbriquées, enums longs, motifs) ; un changement côté Anthropic de ses limites internes ; les
 * outils stricts (aucun agent du socle n'en a, `ExternalContentPolicy`). Les nœuds ne sont qu'un
 * indicateur de taille, calibré sur deux points : un schéma compilé, un schéma refusé.
 */
class StrictSchemasStayWithinTheAttestedSizeTest extends TestCase
{
    /**
     * Le plus gros schéma strict dont la compilation est attestée par un vrai appel : celui de
     * `RadarConsentVerification` (21 nœuds), joué par l'évaluation de référence `radar.verification_accord`
     * du 2026-10-29 (TCK-2403). Refusé, pour comparaison : `RadarExtraction`, 96 nœuds (2026-10-30,
     * `req_011CgXcoW2oogB57WsCGbQkH`).
     */
    public const MAX_ATTESTED_STRICT_NODES = 21;

    /** Limite publiée : paramètres optionnels, tous schémas stricts d'une requête confondus. */
    public const ANTHROPIC_OPTIONAL_LIMIT = 24;

    public function test_chaque_schema_strict_reste_dans_la_taille_attestee(): void
    {
        $strict = array_values(array_filter(
            AnthropicSchemas::structuredAgents(),
            static fn (string $agent): bool => ! AnthropicSchemas::agent($agent) instanceof SocleAgent || AnthropicSchemas::agent($agent)->usesStrictSchema(),
        ));

        // Témoin : la garde juge au moins l'agent strict livré, elle ne passe pas à vide.
        $this->assertContains(RadarConsentVerification::class, $strict);
        foreach ($strict as $agent) {
            $schema = AnthropicSchemas::forAnthropic($agent);
            $nodes = AnthropicSchemas::nodeCount($schema);
            $this->assertLessThanOrEqual(self::MAX_ATTESTED_STRICT_NODES, $nodes, "{$agent} : schéma strict de {$nodes} nœuds, le plus gros attesté en compte ".self::MAX_ATTESTED_STRICT_NODES.' — attester par un vrai appel, ou `usesStrictSchema(): false`');
            $this->assertLessThanOrEqual(self::ANTHROPIC_OPTIONAL_LIMIT, AnthropicSchemas::optionalCount($schema), "{$agent} : trop de paramètres optionnels");
        }
    }

    public function test_le_schema_refuse_par_anthropic_depasse_la_borne(): void
    {
        // Calibrage : le schéma refusé le 2026-10-30, s'il redevenait strict, rougirait la garde.
        $this->assertGreaterThan(self::MAX_ATTESTED_STRICT_NODES, AnthropicSchemas::nodeCount(AnthropicSchemas::forAnthropic(RadarExtraction::class)));
        $this->assertSame(self::MAX_ATTESTED_STRICT_NODES, AnthropicSchemas::nodeCount(AnthropicSchemas::forAnthropic(RadarConsentVerification::class)));
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
        $this->assertSame(8, AnthropicSchemas::nodeCount($schema));
        // c à la racine, d dans l'objet des éléments
        $this->assertSame(2, AnthropicSchemas::optionalCount($schema));
    }
}
