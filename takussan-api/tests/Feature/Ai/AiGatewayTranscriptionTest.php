<?php

namespace Tests\Feature\Ai;

use App\Ai\Usages\FilTranscriptionUsage;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiRefusalReason;
use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Ai\Files\Base64Audio;
use Laravel\Ai\Transcription;
use LogicException;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2976 (ADR-0131 § 7) — `AiGateway::transcribe()` sur le faux du SDK : l'ordre des refus (autorité, coupure,
 * budget) avant tout appel, le rôle vide sans appel, la bascule au maillon suivant, le journal, la langue `fr`
 * transmise, et `run()` qui refuse un usage de transcription.
 */
class AiGatewayTranscriptionTest extends TestCase
{
    use RefreshDatabase, SceneDuCopilote;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
        config(['ai.providers.openai.key' => 'cle-de-test']);
        Transcription::fake(['Bonjour, à demain.']);
    }

    private function transcrire(?User $acteur = null): mixed
    {
        return app(AiGateway::class)->transcribe(new AiRequest(
            usageKey: FilTranscriptionUsage::KEY,
            input: '',
            dataClasses: [AiDataClass::Personnelle],
            actor: $acteur ?? $this->auteur,
            agencyId: (int) $this->agence->id,
        ), new Base64Audio(base64_encode('audio-fictif'), 'audio/webm'));
    }

    private function affecter(array $chaine): void
    {
        config(['ai.roles.transcription' => $chaine]);
    }

    public function test_role_vide_rend_ai_role_unassigned_sans_appel_au_faux(): void
    {
        try {
            $this->transcrire();
            $this->fail('attendu : AiUnavailable');
        } catch (AiUnavailable $e) {
            $this->assertSame('ai.role_unassigned', $e->getMessage());
        }
        Transcription::assertNothingGenerated();
        $this->assertSame('ai.role_unassigned', AiCall::query()->sole()->error_code);
    }

    public function test_autorite_refusee_avant_tout_appel(): void
    {
        $this->affecter([['provider' => 'openai', 'model' => 'modele-t']]);
        $this->assertRefus(AiRefusalReason::Forbidden, fn () => $this->transcrire($this->locataire));
    }

    public function test_coupe_circuit_avant_le_budget(): void
    {
        $this->affecter([['provider' => 'openai', 'model' => 'modele-t']]);
        AiUsageSetting::query()->create(['usage_key' => FilTranscriptionUsage::KEY, 'enabled' => false, 'daily_budget_usd' => '0']);
        $this->assertRefus(AiRefusalReason::KillSwitch, fn () => $this->transcrire());
    }

    public function test_budget_epuise_sans_appel(): void
    {
        $this->affecter([['provider' => 'openai', 'model' => 'modele-t']]);
        AiUsageSetting::query()->create(['usage_key' => FilTranscriptionUsage::KEY, 'enabled' => true, 'daily_budget_usd' => '0']);
        $this->assertRefus(AiRefusalReason::Budget, fn () => $this->transcrire());
    }

    public function test_bascule_au_maillon_suivant_journal_et_langue_fr(): void
    {
        $this->affecter([
            ['provider' => 'fournisseur-inconnu', 'model' => 'x'],
            ['provider' => 'openai', 'model' => 'modele-t'],
        ]);

        $resultat = $this->transcrire();

        $this->assertSame('Bonjour, à demain.', $resultat->text);
        $this->assertSame('fr', $resultat->language);
        Transcription::assertGenerated(fn ($prompt) => $prompt->language === 'fr');
        $appels = AiCall::query()->orderBy('id')->get();
        $this->assertSame([AiCallOutcome::FailedOver, AiCallOutcome::Success], $appels->pluck('outcome')->all());
        $this->assertSame('ai.provider_unknown', $appels[0]->error_code);
        $this->assertSame((int) $this->agence->id, (int) $appels[1]->agency_id);
        $this->assertSame('transcription', $appels[1]->role instanceof \BackedEnum ? $appels[1]->role->value : $appels[1]->role);
        // Le faux ne rend aucun jeton : coût nul, avertissement `usage_missing`, comme pour `run()`.
        $this->assertSame(AiGateway::WARNING_USAGE_MISSING, $appels[1]->warning);
    }

    public function test_run_refuse_un_usage_de_transcription(): void
    {
        $this->affecter([['provider' => 'openai', 'model' => 'modele-t']]);
        $this->expectException(LogicException::class);
        app(AiGateway::class)->run(new AiRequest(usageKey: FilTranscriptionUsage::KEY, input: 'x', dataClasses: [AiDataClass::Personnelle], actor: $this->auteur, agencyId: (int) $this->agence->id));
    }

    private function assertRefus(AiRefusalReason $raison, callable $appel): void
    {
        try {
            $appel();
            $this->fail('attendu : AiRefused');
        } catch (AiRefused) {
        }
        Transcription::assertNothingGenerated();
        $this->assertSame($raison, AiCall::query()->sole()->refusal_reason);
    }
}
