<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\User;
use App\Services\Messaging\FileDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2970 (ADR-0130 § 4, AC3, AC4) — le retard est un geste attendu du PORTEUR seul : après
 * `commitment.overdue`, le fil est non lu et `vous` pour lui (`FileDuFil`), et `meta.gestes` le compte ;
 * ni le bénéficiaire ni le personnel n'ont ce fil en `vous` à cause de lui. `kept` le libère, `reopened` le
 * remet en attente, et chaque engagement est un geste distinct (une clôture par objet).
 *
 * Scène : le locataire porte la promesse, faite au voisin ; l'agent est le personnel. Chaque passage a lieu
 * avant l'échéance + 1 h : la question « Tenu ? » n'est pas encore posée.
 */
class GesteAttenduDuPorteurTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    private Carbon $echeance;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->monterLaScene();
        $this->echeance = now()->addDays(2);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ouvert(): Commitment
    {
        return $this->engagement([
            'status' => CommitmentStatus::Open,
            'beneficiary_id' => $this->voisin->id,
            'due_at' => $this->echeance,
        ]);
    }

    private function enRetard(): void
    {
        Carbon::setTestNow($this->echeance->copy()->addMinutes(5));
        $this->artisan('commitments:signal')->assertSuccessful();
    }

    /** @return array{ligne: array<string, mixed>, gestes: int} */
    private function boite(User $lecteur): array
    {
        Sanctum::actingAs($lecteur);
        $reponse = $this->getJson('/api/conversations')->assertOk();
        $ligne = collect($reponse->json('data'))->firstWhere('id', $this->fil->id);
        $this->assertNotNull($ligne, 'Le fil manque à la boîte du lecteur.');

        return ['ligne' => $ligne, 'gestes' => (int) $reponse->json('meta.gestes')];
    }

    private function tenir(Commitment $engagement, User $acteur): void
    {
        Sanctum::actingAs($acteur);
        $this->postJson("/api/commitments/{$engagement->id}/kept")->assertOk();
    }

    /** AC3 — `overdue` attend le porteur seul. */
    public function test_apres_le_retard_le_fil_est_non_lu_et_vous_pour_le_porteur_seul(): void
    {
        $this->ouvert();
        $this->enRetard();

        $porteur = $this->boite($this->locataire);
        $this->assertSame(FileDuFil::VOUS, $porteur['ligne']['file']);
        $this->assertGreaterThanOrEqual(1, $porteur['ligne']['unread_count']);
        $this->assertSame(1, $porteur['gestes']);

        // Le bénéficiaire et le personnel ne sont pas ATTENDUS par l'événement (aucun non-lu) : ils SUIVENT la
        // promesse, et le fil est pour eux `retard` (TCK-2971, qui prime sur `vous`), compté une fois dans `gestes`.
        foreach ([$this->voisin, $this->agent] as $autre) {
            $boite = $this->boite($autre);
            $this->assertSame(FileDuFil::RETARD, $boite['ligne']['file'], "{$autre->id} suit le retard d'autrui, il n'y est pas attendu.");
            $this->assertSame(0, $boite['ligne']['unread_count'], "{$autre->id} n'est pas attendu par `commitment.overdue`.");
            $this->assertSame(1, $boite['gestes']);
        }
    }

    public function test_tenu_libere_le_porteur(): void
    {
        $engagement = $this->ouvert();
        $this->enRetard();

        $this->tenir($engagement, $this->locataire);

        $porteur = $this->boite($this->locataire);
        $this->assertNotSame(FileDuFil::VOUS, $porteur['ligne']['file']);
        $this->assertSame(0, $porteur['ligne']['unread_count']);
        $this->assertSame(0, $porteur['gestes']);
    }

    /** AC4 — une clôture par objet : tenir l'un de deux engagements en retard laisse l'autre attendu. */
    public function test_deux_engagements_en_retard_tenir_l_un_laisse_l_autre_attendu(): void
    {
        $premier = $this->ouvert();
        $this->ouvert();
        $this->enRetard();

        $this->tenir($premier, $this->locataire);

        $porteur = $this->boite($this->locataire);
        $this->assertSame(FileDuFil::VOUS, $porteur['ligne']['file']);
        $this->assertSame(1, $porteur['ligne']['unread_count']);
        $this->assertSame(1, $porteur['gestes']);
    }

    public function test_rouvert_le_remet_en_attente(): void
    {
        $engagement = $this->ouvert();
        $this->enRetard();
        $this->tenir($engagement, $this->locataire);
        $this->assertNotSame(FileDuFil::VOUS, $this->boite($this->locataire)['ligne']['file']);

        Sanctum::actingAs($this->voisin);
        $this->postJson("/api/commitments/{$engagement->id}/reopen", ['reason' => 'La fuite coule encore'])->assertOk();

        $porteur = $this->boite($this->locataire);
        $this->assertSame(FileDuFil::VOUS, $porteur['ligne']['file']);
        $this->assertSame(1, $porteur['gestes']);
        $this->assertNotSame(FileDuFil::VOUS, $this->boite($this->agent)['ligne']['file']);
    }

    /** La relance manuelle du personnel attend le porteur, une fois par 24 h. */
    public function test_le_personnel_relance_a_la_main_une_fois_par_24_h(): void
    {
        $engagement = $this->ouvert();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/commitments/{$engagement->id}/remind")->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');

        $this->enRetard();
        $this->tenir($engagement, $this->locataire);
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/commitments/{$engagement->id}/reopen", ['reason' => 'Pas encore fait'])->assertOk();
        $this->assertNotSame(FileDuFil::VOUS, $this->boite($this->agent)['ligne']['file']);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/commitments/{$engagement->id}/remind")->assertOk()->assertJsonPath('data.abilities.remind', false);
        $engagement->refresh();
        $this->assertSame(0, $engagement->relances, 'Une relance manuelle ne compte pas parmi les trois automatiques.');
        $this->assertNotNull($engagement->last_relance_at);

        Sanctum::actingAs($this->voisin);
        $this->postJson("/api/commitments/{$engagement->id}/remind")->assertForbidden();
        Sanctum::actingAs($this->locataire);
        $this->postJson("/api/commitments/{$engagement->id}/remind")->assertForbidden();

        Carbon::setTestNow(now()->addHours(23));
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/commitments/{$engagement->id}/remind")->assertStatus(429)->assertJsonPath('code', 'commitment.reminded_recently');

        Carbon::setTestNow(now()->addHours(2));
        $this->postJson("/api/commitments/{$engagement->id}/remind")->assertOk();
        $this->assertSame(FileDuFil::VOUS, $this->boite($this->locataire)['ligne']['file']);
    }
}
