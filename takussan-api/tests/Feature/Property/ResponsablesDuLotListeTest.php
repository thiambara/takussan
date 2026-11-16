<?php

namespace Tests\Feature\Property;

use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-616 (AC4) — la requête EXACTE de `fetchResponsablesDuLot` (`takussan-web/src/lib/biens/
 * responsables-du-lot.ts`), qui alimente « Changer l'agent responsable » de la liste des biens. Le test
 * du front double l'API ; celui-ci prouve que le serveur accepte ces paramètres (un 400 sur le tri ou
 * les champs laisserait l'admin avec « moi » seul, sans aucun rouge) et rend le personnel actif — admin
 * compris —, jamais un bailleur ni un agent suspendu.
 */
class ResponsablesDuLotListeTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const REQUETE = 'filter[assignable]=1&fields[users]=id,first_name,last_name&sort=id&page=1&per_page=100';

    public function test_l_admin_lit_le_personnel_actif_et_aucun_bailleur(): void
    {
        $agency = $this->agence();
        $admin = $this->personnel($agency, 'agency_admin');
        $autreAdmin = $this->personnel($agency, 'agency_admin');
        $agentSansBien = $this->personnel($agency);
        $suspendu = $this->personnel($agency);
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $bailleur = $this->bailleur($agency);

        Sanctum::actingAs($admin);
        $reponse = $this->getJson("/api/agencies/{$agency->id}/members?".self::REQUETE)->assertOk();
        $ids = collect($reponse->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($autreAdmin->id), 'Un administrateur actif est une cible du lot.');
        $this->assertTrue($ids->contains($agentSansBien->id));
        $this->assertFalse($ids->contains($bailleur->id), 'Un bailleur n’est jamais proposé.');
        $this->assertFalse($ids->contains($suspendu->id), 'Un agent suspendu n’est pas une cible.');
    }

    /**
     * L'agent (qui n'administre pas l'agence) passe par `listAssignableStaff` : même requête, même règle,
     * le tri `id` accepté. Un refus (403, sans `crm.assign`) laisserait au front « moi » seul.
     */
    public function test_un_agent_lit_la_meme_liste_par_la_porte_du_personnel_assignable(): void
    {
        $agency = $this->agence();
        $agent = $this->personnel($agency);
        $admin = $this->personnel($agency, 'agency_admin');
        $bailleur = $this->bailleur($agency);

        Sanctum::actingAs($agent);
        $ids = collect($this->getJson("/api/agencies/{$agency->id}/members?".self::REQUETE)->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($admin->id));
        $this->assertTrue($ids->contains($agent->id));
        $this->assertFalse($ids->contains($bailleur->id));
    }
}
