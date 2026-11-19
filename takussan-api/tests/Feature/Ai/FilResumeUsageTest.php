<?php

namespace Tests\Feature\Ai;

use App\Ai\Agents\FilResume;
use App\Ai\Usages\FilResumeUsage;
use App\Jobs\Copilote\DemanderAuCopilote;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\ExternalContentPolicy;
use App\Services\Ai\PromptRepository;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Laravel\Ai\Contracts\HasSkills;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\ObjectSchema;
use Tests\TestCase;

/** TCK-2974 (ADR-0131 § 3) — `fil.resume` au catalogue, son agent sans outil, son schéma, son prompt, son délai. */
class FilResumeUsageTest extends TestCase
{
    public function test_fil_resume_est_au_catalogue_avec_ses_attributs(): void
    {
        $usage = (new AiUsageRegistry)->get('fil.resume');

        $this->assertInstanceOf(FilResumeUsage::class, $usage);
        $this->assertSame(AiModelRole::Redaction, $usage->role());
        $this->assertSame(AiDataClass::Personnelle, $usage->maxDataClass());
        $this->assertSame(Capability::MessagingCopilot, $usage->authority());
        $this->assertSame('1.00', $usage->dailyBudgetUsd());
        $this->assertSame(0, $usage->cacheTtlSeconds());
        $this->assertTrue($usage->readsExternalContent());
    }

    public function test_l_agent_n_a_ni_outil_ni_competence_et_son_schema_exige_les_points(): void
    {
        $this->assertSame([], ExternalContentPolicy::violations((new AiUsageRegistry)->all()));
        $this->assertNotInstanceOf(HasTools::class, new FilResume);
        $this->assertNotInstanceOf(HasSkills::class, new FilResume);

        $schema = (new ObjectSchema((new FilResume)->schema(new JsonSchemaTypeFactory)))->toSchema();
        $this->assertSame(['points'], $schema['required']);
        $this->assertEqualsCanonicalizing(['texte', 'message_id', 'attend_le_lecteur'], $schema['properties']['points']['items']['required']);
    }

    public function test_le_prompt_existe_et_dit_que_le_fil_est_une_donnee(): void
    {
        $prompt = (new PromptRepository)->load('fil.resume', 1);

        foreach (['contenu_externe_', 'message_id', 'attend_le_lecteur', 'N\'invente rien'] as $mot) {
            $this->assertStringContainsString($mot, $prompt, $mot);
        }
    }

    public function test_le_delai_d_un_appel_tient_dans_le_job(): void
    {
        $this->assertLessThan(85, DemanderAuCopilote::TIMEOUT_SECONDS);
        $this->assertSame(60, (new FilResume)->configure('x', 100, 1)->timeout());
        $this->assertLessThanOrEqual(DemanderAuCopilote::AI_CALL_BUDGET_SECONDS, (new FilResume)->configure('x', 100, 2)->timeout() * 2 + 20);
    }
}
