<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Agency;
use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2970 (ADR-0130 § 3, principe n° 2) — l'agence est la frontière d'isolation : le « personnel » d'un
 * engagement est le personnel actif de l'agence du FIL sous son profil ACTIF (`personnelActifDe`), comme la
 * note d'équipe et « Confier ». Un agent d'une autre agence qui participe au fil n'y tranche jamais :
 *
 *  - `$double` est agent de l'agence B (son profil actif) ET, par un autre profil, de l'agence du fil.
 *    Jugé sur toutes ses agences (`estPersonnel`), il tranchait ; sous son profil B, il est refusé ;
 *  - `$bailleur` est agent de B et bailleur de l'agence du fil : jamais personnel.
 *
 * Contrôle : le même `$double`, sous son profil de l'agence du fil, tranche.
 */
class PersonnelDUneAutreAgenceTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    private User $double;

    private User $bailleur;

    private string $profilAilleurs;

    private string $profilIci;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->monterLaScene();
        $autre = Agency::factory()->create();

        $this->double = User::factory()->create();
        $ici = AgentProfile::query()->create(['user_id' => $this->double->id, 'agency_id' => $this->agence->id]);
        $ailleurs = AgentProfile::query()->create(['user_id' => $this->double->id, 'agency_id' => $autre->id]);
        $this->profilIci = "agent:{$ici->id}";
        $this->profilAilleurs = "agent:{$ailleurs->id}";

        $this->bailleur = $this->agentOf($autre);
        OwnerProfile::query()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agence->id]);

        foreach ([$this->double, $this->bailleur] as $membre) {
            $this->fil->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ouvert(array $attributs = []): Commitment
    {
        return $this->engagement($attributs + [
            'status' => CommitmentStatus::Open,
            'beneficiary_id' => $this->voisin->id,
            'due_at' => now()->addDays(2),
        ]);
    }

    private function sous(User $acteur, ?string $profil): void
    {
        Sanctum::actingAs($acteur);
        $this->flushHeaders();
        if ($profil !== null) {
            $this->withHeader('X-Profile-Id', $profil);
        }
    }

    public function test_un_agent_d_une_autre_agence_sous_son_profil_d_ailleurs_ne_tranche_pas(): void
    {
        $ouvert = $this->ouvert();
        $enRetard = $this->ouvert(['due_at' => now()->subDay()]);
        $tenu = $this->ouvert(['status' => CommitmentStatus::Kept, 'kept_at' => now(), 'kept_by_id' => $this->locataire->id]);

        $this->sous($this->double, $this->profilAilleurs);
        $this->postJson("/api/commitments/{$ouvert->id}/kept")->assertForbidden();
        $this->putJson("/api/commitments/{$ouvert->id}", ['title' => 'Autre chose'])->assertForbidden();
        $this->postJson("/api/commitments/{$ouvert->id}/cancel")->assertForbidden();
        $this->postJson("/api/commitments/{$enRetard->id}/remind")->assertForbidden();
        $this->postJson("/api/commitments/{$tenu->id}/reopen", ['reason' => 'Pas fait'])->assertForbidden();

        $ligne = collect($this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertOk()->json('data'))->firstWhere('id', $enRetard->id);
        $this->assertFalse($ligne['abilities']['keep']);
        $this->assertFalse($ligne['abilities']['remind']);
        $this->assertFalse($ligne['abilities']['cancel']);

        $this->assertSame(CommitmentStatus::Open, $ouvert->refresh()->status);
        $this->assertSame(CommitmentStatus::Kept, $tenu->refresh()->status);
    }

    public function test_il_ne_note_pas_pour_autrui_sous_son_profil_d_ailleurs(): void
    {
        $this->sous($this->double, $this->profilAilleurs);

        $this->postJson("/api/conversations/{$this->fil->id}/commitments", [
            'holder_id' => $this->locataire->id,
            'title' => 'Payer le reliquat',
            'due_at' => now()->addDays(3)->utc()->format('Y-m-d\TH:i:s\Z'),
        ])->assertStatus(422)->assertJsonPath('code', 'commitment.not_yours');
    }

    public function test_un_bailleur_agent_ailleurs_ne_tranche_pas(): void
    {
        $tenu = $this->ouvert(['status' => CommitmentStatus::Kept, 'kept_at' => now(), 'kept_by_id' => $this->locataire->id]);

        $this->sous($this->bailleur, null);
        $this->postJson("/api/commitments/{$tenu->id}/reopen", ['reason' => 'Pas fait'])->assertForbidden();
    }

    /** Contrôle : sous son profil de l'agence du fil, le même compte tranche. */
    public function test_sous_son_profil_de_l_agence_du_fil_il_tranche(): void
    {
        $ouvert = $this->ouvert();
        $tenu = $this->ouvert(['status' => CommitmentStatus::Kept, 'kept_at' => now(), 'kept_by_id' => $this->locataire->id]);

        $this->sous($this->double, $this->profilIci);
        $this->postJson("/api/commitments/{$ouvert->id}/kept")->assertOk();
        $this->postJson("/api/commitments/{$tenu->id}/reopen", ['reason' => 'Pas fait'])->assertOk();
        $this->assertNull($tenu->refresh()->party_reopened_at, 'Personnel : il ne consomme pas le droit des parties.');
    }
}
