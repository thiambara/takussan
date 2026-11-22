<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Ai\Usages\FilTranscriptionUsage;
use App\Models\Agency;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Services\Ai\AiBudget;
use App\Services\Ai\AiProviderCatalogue;
use App\Services\Messaging\Copilote\ReglagesDuCopilote;
use App\Services\Messaging\Copilote\SortesDuCopilote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\Ai\UsageDEssai;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2979 (ADR-0131 § 8) — le résolveur branché sur la console IA (`ai_usage_settings`), la capacité de transcrire
 * d'un fournisseur (`ai.provider_role_mismatch`), l'état de la plateforme dans `AgencyResource` et le plafond IA du
 * jour par agence (`ai.daily_budget_per_agency_usd`).
 */
class ReglagesDuCopiloteBrancheTest extends TestCase
{
    use CreatesAgencyMembers, RefreshDatabase, SceneDuCopilote;

    private const FONCTIONS = ['resume', 'question', 'brouillon', 'promesses', ReglagesDuCopilote::TRANSCRIPTION];

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
    }

    private function usageDe(string $fonction): string
    {
        return $fonction === ReglagesDuCopilote::TRANSCRIPTION ? FilTranscriptionUsage::KEY : SortesDuCopilote::usageDe($fonction);
    }

    private function couperALaConsole(string $fonction): void
    {
        AiUsageSetting::query()->updateOrCreate(['usage_key' => $this->usageDe($fonction)], ['enabled' => false]);
    }

    private function reglerLAgence(string $cle, bool $valeur): void
    {
        $this->agence->forceFill(['settings' => array_merge($this->agence->settings ?? [], [$cle => $valeur])])->save();
        $this->agence->refresh();
    }

    private function affecterOpenAi(): void
    {
        config([
            'ai.providers.openai.key' => 'cle-de-test',
            'ai.pricing.openai' => ['modele-t' => ['input' => '1', 'output' => '1', 'cache_read' => '0', 'cache_write' => '0']],
        ]);
    }

    public function test_coupee_a_la_console_chaque_fonction_est_refusee_par_la_plateforme(): void
    {
        $this->affecterOpenAi();
        config(['ai.roles.transcription' => [['provider' => 'openai', 'model' => 'modele-t']]]);
        $reglages = app(ReglagesDuCopilote::class);
        foreach (self::FONCTIONS as $fonction) {
            $this->assertNull($reglages->etat($fonction, $this->agence)['raison'], "{$fonction} servie avant la coupure");
            $this->couperALaConsole($fonction);
            $this->assertSame(['active' => false, 'raison' => 'plateforme'], $reglages->etat($fonction, $this->agence), $fonction);
        }
    }

    /** AC1 — l'agence ne rallume jamais ce que la plateforme coupe, dans les deux ordres. */
    public function test_l_agence_a_vrai_ne_rallume_pas_une_fonction_coupee_a_la_console(): void
    {
        $reglages = app(ReglagesDuCopilote::class);

        $this->reglerLAgence('copilot_enabled', true);
        $this->couperALaConsole('resume');
        $this->assertSame('plateforme', $reglages->etat('resume', $this->agence)['raison']);

        // L'ordre inverse : l'agence coupe, puis la plateforme ; la plateforme reste la raison.
        $this->reglerLAgence('copilot_enabled', false);
        $this->assertSame('plateforme', $reglages->etat('resume', $this->agence)['raison']);
        AiUsageSetting::query()->where('usage_key', $this->usageDe('resume'))->update(['enabled' => true]);
        $this->assertSame('agence', $reglages->etat('resume', $this->agence)['raison']);
    }

    public function test_les_reglages_de_la_console_se_lisent_en_une_requete_pour_toutes_les_fonctions(): void
    {
        $reglages = app(ReglagesDuCopilote::class);
        DB::enableQueryLog();
        $reglages->fonctions($this->agence);
        $lectures = collect(DB::getQueryLog())->filter(fn (array $q) => str_contains($q['query'], 'ai_usage_settings'));
        DB::disableQueryLog();

        $this->assertCount(1, $lectures);
    }

    public function test_la_transcription_non_configuree_puis_servie_par_un_modele_force_openai(): void
    {
        $reglages = app(ReglagesDuCopilote::class);
        $this->assertSame('non_configuree', $reglages->etat(ReglagesDuCopilote::TRANSCRIPTION, $this->agence)['raison']);

        // Un modèle forcé d'un fournisseur sans clé ne la configure pas.
        AiUsageSetting::query()->create(['usage_key' => FilTranscriptionUsage::KEY, 'enabled' => true, 'forced_provider' => 'openai', 'forced_model' => 'modele-t']);
        $this->assertSame('non_configuree', $reglages->etat(ReglagesDuCopilote::TRANSCRIPTION, $this->agence)['raison']);

        $this->affecterOpenAi();
        $this->assertSame(['active' => true, 'raison' => null], $reglages->etat(ReglagesDuCopilote::TRANSCRIPTION, $this->agence));
        $this->assertSame('openai', $reglages->modele(ReglagesDuCopilote::TRANSCRIPTION)?->provider);
    }

    public function test_seuls_openai_et_openrouter_transcrivent(): void
    {
        $catalogue = app(AiProviderCatalogue::class);

        $this->assertSame(
            ['anthropic' => false, 'openai' => true, 'openrouter' => true, 'voyageai' => false],
            collect(['anthropic', 'openai', 'openrouter', 'voyageai'])->mapWithKeys(fn ($p) => [$p => $catalogue->transcribes($p)])->all(),
        );
    }

    public function test_un_modele_force_anthropic_sur_la_transcription_est_refuse(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/ai/usages/'.FilTranscriptionUsage::KEY, ['forced_provider' => 'anthropic', 'forced_model' => 'modele-a'])
            ->assertStatus(422)->assertJsonPath('code', 'ai.provider_role_mismatch');
        $this->assertSame(0, AiUsageSetting::query()->whereNotNull('forced_provider')->count());

        $this->affecterOpenAi();
        $this->patchJson('/api/admin/ai/usages/'.FilTranscriptionUsage::KEY, ['forced_provider' => 'openai', 'forced_model' => 'modele-t'])
            ->assertOk();
    }

    public function test_le_role_transcription_refuse_un_fournisseur_qui_ne_transcrit_pas(): void
    {
        $this->actingAsRole('super_admin');

        $this->putJson('/api/admin/ai/roles/transcription', ['chain' => [['provider' => 'anthropic', 'model' => 'modele-a']]])
            ->assertStatus(422)->assertJsonPath('code', 'ai.provider_role_mismatch');

        $this->affecterOpenAi();
        $this->putJson('/api/admin/ai/roles/transcription', ['chain' => [['provider' => 'openai', 'model' => 'modele-t']]])
            ->assertOk();
        // Un fournisseur qui ne fait que transcrire ne joue aucun autre rôle.
        config(['ai.providers.openai.serves' => 'transcription']);
        $this->putJson('/api/admin/ai/roles/redaction', ['chain' => [['provider' => 'openai', 'model' => 'modele-t']]])
            ->assertStatus(422)->assertJsonPath('code', 'ai.provider_role_mismatch');
    }

    public function test_un_agent_ne_peut_pas_ecrire_copilot_enabled(): void
    {
        Sanctum::actingAs($this->auteur);

        $this->patchJson('/api/agencies/'.$this->agence->id, ['settings' => ['copilot_enabled' => false]])->assertForbidden();
        $this->assertTrue($this->agence->refresh()->setting('copilot_enabled'));
    }

    public function test_l_agence_lit_l_etat_de_la_plateforme_et_l_agent_non(): void
    {
        Sanctum::actingAs($this->agencyAdmin($this->agence));
        $this->getJson('/api/agencies/'.$this->agence->id)->assertOk()
            ->assertJsonPath('data.ai_platform', ['copilot' => true, 'transcription' => true, 'transcription_configured' => false]);

        foreach (SortesDuCopilote::sortes() as $fonction) {
            $this->couperALaConsole($fonction);
        }
        $this->couperALaConsole(ReglagesDuCopilote::TRANSCRIPTION);
        $this->getJson('/api/agencies/'.$this->agence->id)->assertOk()
            ->assertJsonPath('data.ai_platform', ['copilot' => false, 'transcription' => false, 'transcription_configured' => false]);

        Sanctum::actingAs($this->auteur);
        $this->assertArrayNotHasKey('ai_platform', $this->getJson('/api/agencies/'.$this->agence->id)->assertOk()->json('data'));
    }

    /** AC4 — sans valeur, pas de plafond ; posé et atteint, cette agence seule est refusée. */
    public function test_le_plafond_par_agence_des_parametres_plateforme(): void
    {
        $autre = Agency::factory()->create();
        // L'agence dépense 0,60 $ ; l'autre 0,40 $ — sous le plafond seule, au-dessus si la somme oubliait `agency_id`.
        foreach ([[$this->agence, '0.40'], [$this->agence, '0.20'], [$autre, '0.40']] as [$agence, $cout]) {
            AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => $cout, 'agency_id' => $agence->id]);
        }
        $budget = app(AiBudget::class);

        $this->assertFalse($budget->exhausted(new UsageDEssai, null, $this->agence->id));

        $this->actingAsRole('super_admin');
        $this->patchJson('/api/admin/settings', ['ai.daily_budget_per_agency_usd' => '0.60'])->assertOk();

        $this->assertTrue(app(AiBudget::class)->exhausted(new UsageDEssai, null, $this->agence->id));
        $this->assertFalse(app(AiBudget::class)->exhausted(new UsageDEssai, null, $autre->id));

        // Vidé : plus de plafond.
        $this->patchJson('/api/admin/settings', ['ai.daily_budget_per_agency_usd' => null])->assertOk();
        $this->assertFalse(app(AiBudget::class)->exhausted(new UsageDEssai, null, $this->agence->id));
    }

    public function test_le_plafond_par_agence_prend_son_defaut_dans_la_configuration_et_refuse_zero(): void
    {
        config(['ai.budgets.daily_per_agency_usd' => '0.10']);
        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => '0.10', 'agency_id' => $this->agence->id]);
        $this->assertTrue(app(AiBudget::class)->exhausted(new UsageDEssai, null, $this->agence->id));

        $this->actingAsRole('super_admin');
        $this->patchJson('/api/admin/settings', ['ai.daily_budget_per_agency_usd' => 0])->assertStatus(422);
    }
}
