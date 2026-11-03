<?php

namespace Tests\Unit\Ai;

use App\Ai\Agents\ConnectionTestAgent;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\ExternalContentPolicy;
use PHPUnit\Framework\TestCase;
use Tests\Support\Ai\AgentCompetencesDEssai;
use Tests\Support\Ai\AgentOutilleDEssai;
use Tests\Support\Ai\UsageContenuExterneDEssai;
use Tests\Support\Ai\UsageDEssai;

/**
 * TCK-2398 (ADR-0076 §10) — un usage qui lit un contenu externe n'a aucun outil et ne rend qu'une
 * sortie structurée. La garde : le catalogue réel ne compte aucune violation, et chaque violation
 * possible est reconnue sur un usage d'essai.
 */
class ExternalContentUsagesHaveNoToolsTest extends TestCase
{
    public function test_le_catalogue_des_usages_ne_compte_aucune_violation(): void
    {
        $this->assertSame([], ExternalContentPolicy::violations((new AiUsageRegistry)->all()));
    }

    public function test_un_usage_de_contenu_externe_structure_et_sans_outil_passe(): void
    {
        $this->assertSame([], ExternalContentPolicy::violations([new UsageContenuExterneDEssai]));
    }

    public function test_un_agent_outille_est_refuse(): void
    {
        $violations = ExternalContentPolicy::violations([new UsageContenuExterneDEssai(AgentOutilleDEssai::class)]);

        $this->assertCount(1, $violations);
        $this->assertStringContainsString('outils', $violations[0]);
    }

    public function test_un_agent_a_competences_est_refuse_le_sdk_lui_ajoute_un_outil(): void
    {
        $this->assertCount(1, ExternalContentPolicy::violations([new UsageContenuExterneDEssai(AgentCompetencesDEssai::class)]));
    }

    public function test_un_agent_sans_sortie_structuree_est_refuse(): void
    {
        $violations = ExternalContentPolicy::violations([new UsageContenuExterneDEssai(ConnectionTestAgent::class)]);

        $this->assertCount(1, $violations);
        $this->assertStringContainsString('structurée', $violations[0]);
    }

    public function test_un_usage_qui_ne_lit_aucun_contenu_externe_n_est_pas_juge(): void
    {
        $this->assertFalse((new UsageDEssai)->readsExternalContent());
        $this->assertSame([], ExternalContentPolicy::violations([new UsageDEssai]));
    }
}
