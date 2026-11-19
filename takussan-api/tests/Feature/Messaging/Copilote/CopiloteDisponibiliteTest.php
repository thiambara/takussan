<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Console\Commands\MessagingPurgeCopilotProposals;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\User;
use App\Services\Admin\ImpersonationService;
use App\Services\Messaging\Copilote\SortesDuCopilote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2974 (ADR-0131 § 3, § 6, AC6) — `copilote` dans `ConversationResource`, calculé EN LOT pour la page, et la
 * purge des propositions du copilote à 30 jours.
 */
class CopiloteDisponibiliteTest extends TestCase
{
    use RefreshDatabase, SceneDuCopilote;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
    }

    public function test_copilote_rendu_a_l_agent_participant_faux_pour_le_locataire_et_le_super_admin(): void
    {
        $this->assertSame($this->fonctions(true, null), $this->copiloteDe($this->auteur));
        $this->assertSame(false, $this->copiloteDe($this->locataire));
        $this->assertSame(false, $this->copiloteDe($this->bailleur));

        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');
        $this->fil->participants()->attach($operateur->id, ['role' => 'member', 'joined_at' => now()]);
        $this->assertSame(false, $this->copiloteDe($operateur));

        Sanctum::actingAs($this->auteur);
        $this->getJson('/api/conversations/'.$this->fil->id)->assertOk()->assertJsonPath('data.copilote.fonctions.resume.active', true);
        Sanctum::actingAs($this->locataire);
        $this->getJson('/api/conversations/'.$this->fil->id)->assertOk()->assertJsonPath('data.copilote', false);
    }

    public function test_sous_impersonation_le_copilote_est_refuse_et_le_booleen_faux(): void
    {
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');
        ['token' => $jeton] = app(ImpersonationService::class)->start($operateur, $this->auteur, 'Ticket support 4821 : relecture.');
        $this->app['auth']->forgetGuards();

        $this->withToken($jeton)->getJson('/api/conversations/'.$this->fil->id.'/copilote')
            ->assertForbidden()->assertJsonPath('code', 'copilote.indisponible');
        $ligne = collect($this->withToken($jeton)->getJson('/api/conversations')->assertOk()->json('data'))->firstWhere('id', $this->fil->id);
        $this->assertFalse($ligne['copilote']);
        $this->assertSame(0, AiCall::query()->count());
    }

    public function test_copilote_coupe_dit_au_personnel_pourquoi_et_reste_faux_pour_les_autres(): void
    {
        config(['ai.copilote.actif' => false]);

        $this->assertSame($this->fonctions(false, 'plateforme'), $this->copiloteDe($this->auteur));
        $this->assertSame(false, $this->copiloteDe($this->locataire));

        config(['ai.copilote.actif' => true, 'ai.copilote.fonctions.resume' => false]);
        $copilote = $this->copiloteDe($this->auteur);
        $this->assertSame(['active' => false, 'raison' => 'plateforme'], $copilote['fonctions']['resume']);
        $this->assertSame(['active' => true, 'raison' => null], $copilote['fonctions']['brouillon']);
    }

    public function test_ac6_les_requetes_de_la_liste_ne_croissent_pas_de_1_a_30_fils(): void
    {
        $this->requetesDeLaListe(); // l'amorce : ce que le premier appel met en mémoire ne se compte pas
        [$un, $fils] = $this->requetesDeLaListe();
        for ($i = 0; $i < 29; $i++) {
            $this->groupe([$this->auteur, $this->locataire], ['lease_id' => $this->bail->id, 'property_id' => $this->bien->id]);
        }
        [$trente, $filsEnsuite] = $this->requetesDeLaListe();

        $this->assertSame($fils + 29, $filsEnsuite);
        $this->assertSame($un, $trente, "La liste fait {$un} requêtes pour {$fils} fil(s), {$trente} pour {$filsEnsuite}.");
    }

    public function test_la_purge_vide_les_propositions_du_copilote_de_plus_de_30_jours_seulement(): void
    {
        $vieille = $this->suggestion('fil.resume', 31);
        $recente = $this->suggestion('fil.resume', 29);
        $radar = $this->suggestion('radar.extraction', 31);

        $this->artisan(MessagingPurgeCopilotProposals::class)->assertSuccessful();

        $this->assertSame([], $vieille->fresh()->proposal);
        $this->assertNull($vieille->fresh()->final_value);
        $this->assertNull($vieille->fresh()->correction_diff);
        $this->assertNotSame([], $recente->fresh()->proposal);
        $this->assertNotSame([], $radar->fresh()->proposal);
        $this->assertSame(3, AiSuggestion::query()->count());
    }

    /** @return array{fonctions: array<string, array{active: bool, raison: string|null}>} */
    private function fonctions(bool $active, ?string $raison): array
    {
        return ['fonctions' => array_fill_keys(SortesDuCopilote::sortes(), ['active' => $active, 'raison' => $raison])];
    }

    private function copiloteDe(User $lecteur): mixed
    {
        Sanctum::actingAs($lecteur);
        $ligne = collect($this->getJson('/api/conversations')->assertOk()->json('data'))->firstWhere('id', $this->fil->id);

        return $ligne['copilote'] ?? null;
    }

    /** @return array{0: int, 1: int} requêtes, fils rendus */
    private function requetesDeLaListe(): array
    {
        Sanctum::actingAs($this->auteur);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $reponse = $this->getJson('/api/conversations?per_page=50')->assertOk();
        $n = count(DB::getQueryLog());
        DB::disableQueryLog();
        $this->assertNotEmpty(array_filter(array_column($reponse->json('data'), 'copilote'), 'is_array'));

        return [$n, count($reponse->json('data'))];
    }

    private function suggestion(string $usage, int $jours): AiSuggestion
    {
        $appel = AiCall::query()->create(['usage_key' => $usage, 'outcome' => AiCallOutcome::Success, 'actor_id' => $this->auteur->id]);
        $s = AiSuggestion::query()->create([
            'usage_key' => $usage, 'ai_call_id' => $appel->id, 'subject_type' => $this->fil->getMorphClass(), 'subject_id' => $this->fil->id,
            'proposal' => ['points' => [['texte' => 'x', 'message_id' => 1, 'attend_le_lecteur' => false]]],
            'decision' => AiSuggestionDecision::Edited, 'final_value' => ['x' => 1], 'correction_diff' => ['x' => ['from' => 0, 'to' => 1]],
        ]);
        $s->forceFill(['created_at' => now()->subDays($jours)])->save();

        return $s;
    }
}
