<?php

namespace Tests\Feature\Messaging\NoteDEquipe;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Admin\ImpersonationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\SceneDeNoteDEquipe;

/**
 * TCK-2967 (pour TCK-2968) — les deux drapeaux de la note d'équipe dans `GET /api/conversations/{id}/context`.
 *
 * - `can_write_team_note` : la règle du refus 422 de TCK-2965 (personnel actif de l'agence du fil, sous
 *   son profil actif) ;
 * - `participants[].reads_team_notes` : la règle du tiers des mentions de TCK-2966 (participant actif et
 *   personnel de l'agence du fil), en lot ; faux partout pour un appelant qui ne lit pas les notes.
 *
 * Le bailleur de la scène est aussi agent d'une AUTRE agence : il a sa ligne (propriétaire), et c'est elle
 * qui dit qu'un agent d'ailleurs ne lit pas les notes. L'agent de l'autre agence de la scène, lui, n'a
 * aucune relation lisible au fil et n'a pas de ligne.
 */
class DrapeauxDeLaNoteTest extends ApiTestCase
{
    use RefreshDatabase, SceneDeNoteDEquipe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        AgentProfile::query()->create(['user_id' => $this->bailleur->id, 'agency_id' => Agency::factory()->create()->id]);
    }

    /** @return array{0: bool, 1: array<int, bool>} `can_write_team_note`, puis `reads_team_notes` par compte */
    private function drapeaux(User $appelant, ?string $jeton = null): array
    {
        $reponse = $jeton === null
            ? tap($this, fn () => Sanctum::actingAs($appelant))->getJson("/api/conversations/{$this->fil->id}/context")
            : $this->withToken($jeton)->getJson("/api/conversations/{$this->fil->id}/context");
        $data = $reponse->assertOk()->json('data');

        return [$data['can_write_team_note'], collect($data['participants'])->mapWithKeys(fn (array $l) => [$l['user_id'] => $l['reads_team_notes']])->all()];
    }

    public function test_l_agent_de_l_agence_peut_ecrire_une_note_et_voit_qui_la_lira(): void
    {
        [$ecrit, $lit] = $this->drapeaux($this->auteur);

        $this->assertTrue($ecrit);
        $this->assertTrue($lit[$this->auteur->id]);
        $this->assertTrue($lit[$this->collegue->id]);
        $this->assertFalse($lit[$this->locataire->id]);
        $this->assertFalse($lit[$this->bailleur->id], 'agent d\'une autre agence : ne lit pas les notes de ce fil');
        $this->assertFalse($lit[$this->agentAilleurs->id] ?? false);
    }

    public function test_le_locataire_ne_peut_pas_ecrire_et_n_apprend_rien_des_notes(): void
    {
        [$ecrit, $lit] = $this->drapeaux($this->locataire);

        $this->assertFalse($ecrit);
        $this->assertNotEmpty($lit);
        $this->assertSame([], array_keys(array_filter($lit)), 'aucun lecteur des notes révélé au client');
    }

    public function test_l_agent_d_une_autre_agence_ne_peut_pas_ecrire_une_note(): void
    {
        [$ecrit, $lit] = $this->drapeaux($this->agentAilleurs);

        $this->assertFalse($ecrit);
        $this->assertSame([], array_keys(array_filter($lit)));
    }

    public function test_sous_impersonation_du_locataire_le_point_de_vue_est_celui_de_la_cible(): void
    {
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');
        [$ecritHors, $litHors] = $this->drapeaux($operateur);
        $this->assertFalse($ecritHors, 'le super-admin lit les notes, il n\'en écrit pas');
        $this->assertTrue($litHors[$this->collegue->id]);

        ['token' => $jeton] = app(ImpersonationService::class)->start($operateur, $this->locataire, 'Ticket support 4821 : relecture.');
        $this->app['auth']->forgetGuards();
        [$ecrit, $lit] = $this->drapeaux($this->locataire, $jeton);

        $this->assertFalse($ecrit);
        $this->assertSame([], array_keys(array_filter($lit)));
    }

    /**
     * Un participant sans ligne de relation (personnel par délégation seule : `RelationsAuFil` ne lit que les
     * profils) porte quand même le drapeau, dans `team_note_reader_ids` ; l'agent d'une autre agence, sans
     * ligne lui non plus, n'y est pas.
     */
    public function test_un_participant_sans_relation_porte_aussi_le_drapeau(): void
    {
        $delegue = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $delegue->id, 'agency_id' => $this->agence->id]);
        RoleDelegation::factory()->create(['user_id' => $delegue->id, 'agency_id' => $this->agence->id, 'role' => 'agent']);
        $this->fil->participants()->attach($delegue->id, ['role' => 'member', 'joined_at' => now()]);

        Sanctum::actingAs($this->auteur);
        $data = $this->getJson("/api/conversations/{$this->fil->id}/context")->assertOk()->json('data');

        $this->assertNotContains($delegue->id, array_column($data['participants'], 'user_id'), 'sans relation lisible : pas de ligne');
        $this->assertNotContains($this->agentAilleurs->id, array_column($data['participants'], 'user_id'));
        $this->assertSame(
            collect([$this->auteur->id, $this->collegue->id, $delegue->id])->sort()->values()->all(),
            $data['team_note_reader_ids'],
        );

        Sanctum::actingAs($this->locataire);
        $this->assertSame([], $this->getJson("/api/conversations/{$this->fil->id}/context")->assertOk()->json('data.team_note_reader_ids'));
    }

    /** Le personnel de l'agence se lit en une requête, quel que soit le nombre de participants. */
    public function test_les_drapeaux_ne_coutent_pas_une_requete_par_participant(): void
    {
        $compter = function (): int {
            // Chaque mesure part à froid, comme une requête réelle : les instances `scoped()` (le cache de
            // `IntegrationLocator`, lu par le bloc `pont`) vivent une requête, mais deux appels d'un même test
            // partagent le conteneur — la seconde mesure en aurait hérité deux requêtes de moins.
            $this->app->forgetScopedInstances();
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->drapeaux($this->auteur);
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };
        $avant = $compter();
        foreach (range(1, 5) as $_) {
            $this->fil->participants()->attach($this->agentDeLAgence($this->agence)->id, ['role' => 'member', 'joined_at' => now()]);
        }
        $this->fil->unsetRelation('participants');

        $this->assertSame($avant, $compter());
    }
}
