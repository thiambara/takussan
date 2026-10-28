<?php

namespace Tests\Feature\Ai;

use App\Ai\Agents\RadarConsentMessage;
use App\Ai\Usages\RadarConsentMessageUsage;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\AttachmentsUseVision;
use App\Services\Ai\ExternalContentPolicy;
use App\Services\Ai\PromptRepository;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Laravel\Ai\Contracts\HasSkills;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\ObjectSchema;
use Tests\TestCase;

/**
 * TCK-2388 (ADR-0077 §4, sur le socle d'ADR-0076) — les usages du démarchage au catalogue : `radar.message_accord`
 * (rôle `redaction`, classe `personnelle`, contenu externe, aucune pièce jointe), agents sans outil.
 */
class RadarConsentUsagesTest extends TestCase
{
    public function test_message_accord_est_au_catalogue_avec_ses_attributs(): void
    {
        $registre = new AiUsageRegistry;
        $usage = $registre->get('radar.message_accord');

        $this->assertInstanceOf(RadarConsentMessageUsage::class, $usage);
        $this->assertSame(AiModelRole::Redaction, $usage->role());
        $this->assertSame(RadarConsentMessage::class, $usage->agentClass());
        $this->assertSame(AiDataClass::Personnelle, $usage->maxDataClass());
        $this->assertSame(PlatformAbility::RadarOperate, $usage->authority());
        $this->assertSame(300.0, $usage->dailyBudgetXof());
        $this->assertSame(0, $usage->cacheTtlSeconds());
        $this->assertTrue($usage->readsExternalContent());
        $this->assertSame(1, $usage->promptVersion());
        $this->assertNotInstanceOf(AttachmentsUseVision::class, $usage);
    }

    public function test_les_agents_du_demarchage_n_ont_ni_outil_ni_competence_et_rendent_une_sortie_structuree(): void
    {
        $this->assertSame([], ExternalContentPolicy::violations((new AiUsageRegistry)->all()));
        $agent = new RadarConsentMessage;
        $this->assertInstanceOf(HasStructuredOutput::class, $agent);
        $this->assertNotInstanceOf(HasTools::class, $agent);
        $this->assertNotInstanceOf(HasSkills::class, $agent);
    }

    public function test_le_schema_de_message_accord_exige_salutation_et_resume(): void
    {
        $schema = (new ObjectSchema((new RadarConsentMessage)->schema(new JsonSchemaTypeFactory)))->toSchema();

        $this->assertEqualsCanonicalizing(['salutation', 'resume'], array_keys($schema['properties']));
        $this->assertEqualsCanonicalizing(['salutation', 'resume'], $schema['required']);
    }

    public function test_le_prompt_de_message_accord_existe_et_dit_ce_qu_il_interdit(): void
    {
        $prompt = (new PromptRepository)->load('radar.message_accord', 1);

        foreach (['contenu_externe_', 'une seule ligne', 'numéro de téléphone', 'Bonjour à nouveau'] as $mot) {
            $this->assertStringContainsString($mot, $prompt, $mot);
        }
    }

    public function test_le_delai_de_l_agent_est_partage_entre_les_maillons_sous_le_budget_d_une_requete_web(): void
    {
        $delai = fn (int $maillons) => (new RadarConsentMessage)->configure('x', 100, $maillons)->timeout();

        // (40 − 10 × maillons) ÷ maillons, plancher 5 s : l'attente de la nouvelle tentative du SDK est réservée.
        $this->assertSame(30, $delai(1));
        $this->assertSame(10, $delai(2));
        $this->assertSame(RadarConsentMessage::MIN_TIMEOUT_SECONDS, $delai(3));
        $this->assertSame(RadarConsentMessage::MIN_TIMEOUT_SECONDS, $delai(5));
        $this->assertSame(40, RadarConsentMessage::REQUEST_BUDGET_SECONDS);
    }
}
