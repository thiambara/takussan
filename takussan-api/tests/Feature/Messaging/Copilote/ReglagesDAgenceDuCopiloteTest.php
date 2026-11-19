<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Models\Agency;
use App\Services\Messaging\Copilote\ReglagesDuCopilote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2979 (ADR-0131 § 8) — l'interrupteur de l'agence : `copilot_enabled` (résumé, question, brouillon, promesses)
 * et `voice_transcription_enabled` (transcription), vrais par défaut. L'agence ne peut qu'éteindre : la plateforme
 * prime. Coupé, la route refuse sans job (`copilote.coupe`) et `copilote` du fil dit `raison: agence`.
 */
class ReglagesDAgenceDuCopiloteTest extends TestCase
{
    use CreatesAgencyMembers, RefreshDatabase, SceneDuCopilote;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
    }

    private function couper(string $cle): void
    {
        $this->agence->forceFill(['settings' => array_merge($this->agence->settings ?? [], [$cle => false])])->save();
        $this->agence->refresh();
    }

    public function test_vrais_par_defaut_la_fonction_est_servie(): void
    {
        $this->assertTrue($this->agence->setting('copilot_enabled'));
        $this->assertTrue($this->agence->setting('voice_transcription_enabled'));
        $this->assertSame(['active' => true, 'raison' => null], app(ReglagesDuCopilote::class)->etat('resume', $this->agence));
    }

    public function test_copilot_enabled_faux_coupe_le_resume_pour_l_agence_seulement(): void
    {
        $autre = Agency::factory()->create();
        $this->couper('copilot_enabled');
        $reglages = app(ReglagesDuCopilote::class);

        $this->assertSame(['active' => false, 'raison' => 'agence'], $reglages->etat('resume', $this->agence));
        $this->assertSame(['active' => true, 'raison' => null], $reglages->etat('resume', $autre));
        $this->assertSame([(int) $this->agence->id], $reglages->agencesQuiCoupent([(int) $this->agence->id, (int) $autre->id]));
        // La transcription a son propre réglage : `copilot_enabled` ne la coupe pas à l'agence.
        $this->assertSame([], $reglages->agencesQuiCoupent([(int) $this->agence->id], ReglagesDuCopilote::TRANSCRIPTION));
    }

    public function test_voice_transcription_enabled_faux_coupe_la_seule_transcription(): void
    {
        $this->couper('voice_transcription_enabled');
        $reglages = app(ReglagesDuCopilote::class);

        $this->assertSame([(int) $this->agence->id], $reglages->agencesQuiCoupent([(int) $this->agence->id], ReglagesDuCopilote::TRANSCRIPTION));
        $this->assertSame(['active' => true, 'raison' => null], $reglages->etat('resume', $this->agence));
    }

    public function test_la_plateforme_prime_sur_l_agence(): void
    {
        $this->couper('copilot_enabled');
        config(['ai.copilote.fonctions.resume' => false]);

        $this->assertSame('plateforme', app(ReglagesDuCopilote::class)->etat('resume', $this->agence)['raison']);
    }

    public function test_coupe_par_l_agence_la_route_refuse_sans_appel_et_le_fil_le_dit(): void
    {
        $premier = $this->ecrireDesMessages(10, $this->locataire);
        $this->couper('copilot_enabled');

        $this->demanderUnResume($this->auteur, (int) $premier->id)->assertStatus(409)->assertJsonPath('code', 'copilote.coupe');
        $this->assertDatabaseCount('ai_calls', 0);

        Sanctum::actingAs($this->auteur);
        $this->getJson('/api/conversations/'.$this->fil->id)->assertOk()
            ->assertJsonPath('data.copilote.fonctions.resume', ['active' => false, 'raison' => 'agence']);
    }

    public function test_l_administrateur_ecrit_les_deux_reglages_par_la_route_de_l_agence(): void
    {
        $admin = $this->agencyAdmin($this->agence);
        Sanctum::actingAs($admin);

        $this->patchJson('/api/agencies/'.$this->agence->id, ['settings' => ['copilot_enabled' => false, 'voice_transcription_enabled' => false]])
            ->assertOk();

        $this->agence->refresh();
        $this->assertFalse($this->agence->setting('copilot_enabled'));
        $this->assertFalse($this->agence->setting('voice_transcription_enabled'));
    }
}
