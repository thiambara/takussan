<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use App\Services\Messaging\FileDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2971 (ADR-0130 § 5, AC1) — la file `retard` : un fil porte un engagement `open` échu, dont le porteur
 * n'est pas du côté du lecteur, et que le lecteur suit (bénéficiaire, ou personnel de l'agence du fil).
 * Un jeu de données par règle. Préséance : `rappel` > `retard` > `vous`. « Traité » ne s'y applique pas.
 *
 * Scène : l'agent et `collegue` forment l'équipe de l'agence du fil ; le locataire et le voisin sont deux
 * clients, chacun de son côté.
 */
class FileRetardTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    private User $collegue;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->monterLaScene();
        $this->collegue = $this->agentOf($this->agence);
        $this->fil->participants()->attach($this->collegue->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function enRetard(User $porteur, ?User $beneficiaire, array $attributs = []): Commitment
    {
        return $this->engagement($attributs + [
            'status' => CommitmentStatus::Open,
            'holder_id' => $porteur->id,
            'beneficiary_id' => $beneficiaire?->id,
            'due_at' => now()->subDay(),
        ]);
    }

    /** @return array<string, mixed> */
    private function ligne(User $lecteur, ?Conversation $fil = null, array $requete = []): array
    {
        Sanctum::actingAs($lecteur);
        $ligne = collect($this->getJson('/api/conversations?'.http_build_query($requete))->assertOk()->json('data'))
            ->firstWhere('id', ($fil ?? $this->fil)->id);
        $this->assertNotNull($ligne, 'Le fil manque à la boîte du lecteur.');

        return $ligne;
    }

    private function file(User $lecteur): string
    {
        return $this->ligne($lecteur)['file'];
    }

    public function test_le_beneficiaire_client_voit_retard(): void
    {
        $engagement = $this->enRetard($this->agent, $this->locataire);

        $ligne = $this->ligne($this->locataire);
        $this->assertSame(FileDuFil::RETARD, $ligne['file']);
        $this->assertSame(now()->subDay()->utc()->toIso8601String(), $ligne['retard_depuis']);
        $this->assertSame([
            'id' => $engagement->id, 'title' => $engagement->title, 'holder_id' => $this->agent->id,
            'due_at' => now()->subDay()->utc()->toIso8601String(), 'etat' => 'late',
        ], $ligne['engagement']);
    }

    public function test_le_personnel_voit_retard_pour_l_engagement_d_un_client(): void
    {
        $this->enRetard($this->locataire, null);

        $this->assertSame(FileDuFil::RETARD, $this->file($this->agent));
        $this->assertSame(FileDuFil::RETARD, $this->file($this->collegue));
    }

    /** AC1 — le côté : l'engagement d'un collègue n'est pas en retard « envers » l'équipe. */
    public function test_un_collegue_ne_voit_pas_retard_pour_l_engagement_d_un_collegue(): void
    {
        $this->enRetard($this->agent, $this->locataire);

        $this->assertNotSame(FileDuFil::RETARD, $this->file($this->collegue));
        $this->assertNotSame(FileDuFil::RETARD, $this->file($this->agent));
    }

    /** AC1 — « que L suit » : un autre client du fil, non bénéficiaire, ne voit rien. */
    public function test_un_autre_client_non_beneficiaire_ne_voit_rien(): void
    {
        $this->enRetard($this->agent, $this->locataire);

        $this->assertNotSame(FileDuFil::RETARD, $this->file($this->voisin));
        $this->assertNull($this->ligne($this->voisin)['retard_depuis']);
    }

    public function test_le_porteur_voit_vous_jamais_retard(): void
    {
        $this->enRetard($this->locataire, $this->voisin);
        $this->artisan('commitments:signal')->assertSuccessful();

        $this->assertSame(FileDuFil::VOUS, $this->file($this->locataire));
        $this->assertSame(FileDuFil::RETARD, $this->file($this->voisin));
    }

    /** AC1 — `retard` prime sur `vous`, et `rappel` sur `retard`. */
    public function test_retard_prime_sur_vous_et_rappel_sur_retard(): void
    {
        $this->enRetard($this->locataire, null);
        $this->message($this->fil, $this->locataire);

        $this->assertSame(FileDuFil::RETARD, $this->file($this->agent));

        $this->fil->participants()->updateExistingPivot($this->agent->id, ['snoozed_until' => now()->addDay()]);
        $this->assertSame(FileDuFil::RAPPEL, $this->file($this->agent));
    }

    /** AC1 — « Traité » ne sort pas un fil de `retard`. */
    public function test_traite_ne_sort_pas_de_retard(): void
    {
        $this->enRetard($this->locataire, null);
        $this->message($this->fil, $this->locataire);

        Sanctum::actingAs($this->agent);
        $this->putJson("/api/conversations/{$this->fil->id}/handled")->assertOk();
        Carbon::setTestNow(now()->addMinute());

        $this->assertSame(FileDuFil::RETARD, $this->file($this->agent));
    }

    public function test_un_engagement_tenu_sort_de_retard(): void
    {
        $engagement = $this->enRetard($this->locataire, $this->voisin);
        $this->assertSame(FileDuFil::RETARD, $this->file($this->voisin));

        Sanctum::actingAs($this->voisin);
        $this->postJson("/api/commitments/{$engagement->id}/kept")->assertOk();

        $ligne = $this->ligne($this->voisin);
        $this->assertNotSame(FileDuFil::RETARD, $ligne['file']);
        $this->assertNull($ligne['engagement']);
    }

    public function test_un_engagement_a_venir_n_est_pas_en_retard_mais_reste_le_plus_pressant(): void
    {
        $this->enRetard($this->locataire, null, ['due_at' => now()->addDays(2)]);

        $ligne = $this->ligne($this->agent);
        $this->assertNotSame(FileDuFil::RETARD, $ligne['file']);
        $this->assertSame('open', $ligne['engagement']['etat']);
    }

    public function test_le_filtre_retard_ordonne_par_la_plus_ancienne_echeance_et_compte(): void
    {
        $ancien = $this->groupe([$this->agent, $this->locataire], ['property_id' => $this->bien->id]);
        $this->enRetard($this->locataire, null);
        $this->enRetard($this->locataire, null, ['conversation_id' => $ancien->id, 'due_at' => now()->subDays(5)]);
        $this->message($this->fil, $this->voisin);

        Sanctum::actingAs($this->agent);
        $reponse = $this->getJson('/api/conversations?filter[file]=retard')->assertOk();
        $this->assertSame([$ancien->id, $this->fil->id], array_column($reponse->json('data'), 'id'));
        $this->assertSame(2, $reponse->json('meta.counts.retard'));
    }
}
