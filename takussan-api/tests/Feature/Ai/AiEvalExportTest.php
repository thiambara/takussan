<?php

namespace Tests\Feature\Ai;

use App\Models\AiSuggestion;
use App\Services\Ai\Evaluation\EvalCaseAnonymizer;
use App\Services\Ai\Evaluation\EvalCaseExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2384 (AC5) — une correction devient un cas d'évaluation sans nom, téléphone ni courriel. */
class AiEvalExportTest extends TestCase
{
    use RefreshDatabase;

    private string $racine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->racine = storage_path('framework/testing/ai-export-'.Str::random(8));
        $this->app->instance(EvalCaseExporter::class, new EvalCaseExporter(new EvalCaseAnonymizer, $this->racine));
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->racine);
        parent::tearDown();
    }

    private function suggestion(string $decision): AiSuggestion
    {
        return AiSuggestion::query()->create([
            'usage_key' => UsageDEssai::KEY,
            'proposal' => ['titre' => 'Appartement', 'contact_nom' => 'Awa Diop', 'prix' => 100],
            'final_value' => ['titre' => 'Appartement F3', 'contact_nom' => 'Awa Diop', 'prix' => 100],
            'input_snapshot' => 'Appartement à Mermoz. Contactez Awa Diop au 77 123 45 67 ou awa.diop@exemple.sn',
            'decision' => $decision,
            'decided_at' => now(),
        ]);
    }

    public function test_an_edited_suggestion_is_exported_without_personal_data(): void
    {
        $edited = $this->suggestion('edited');
        $this->suggestion('accepted');
        $this->suggestion('pending');

        $this->artisan('ai:export-eval-cases', ['usage' => UsageDEssai::KEY])->assertSuccessful();

        $files = File::files($this->racine.'/'.UsageDEssai::KEY.'/cases');
        $this->assertCount(1, $files);
        $this->assertSame('export-'.$edited->id.'.json', $files[0]->getFilename());
        $brut = $files[0]->getContents();
        foreach (['Awa', 'Diop', '123 45 67', 'exemple.sn'] as $fuite) {
            $this->assertStringNotContainsString($fuite, $brut);
        }
        $cas = json_decode($brut, true);
        $this->assertSame('Appartement à Mermoz. Contactez [NOM] au [TELEPHONE] ou [EMAIL]', $cas['input']);
        // jsonb ne garde pas l'ordre des clés : on compare le contenu, pas l'ordre.
        $this->assertEquals(['titre' => 'Appartement F3', 'contact_nom' => '[NOM]', 'prix' => 100], $cas['expected']);
    }
}
