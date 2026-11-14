<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2639 — la fiche du bien mène à celle de son bailleur : `owner_profile_id` est le profil de
 * bailleur du titulaire DANS l'agence du bien, rendu à qui `GET /api/owners/{id}` répondrait (l'admin
 * actif de cette agence), nul pour l'agent, le bailleur lui-même et l'admin d'une autre agence.
 */
class FicheDuBienProfilDuBailleurTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $bailleur;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = $this->moneyAgency();
        // Le même bailleur a d'abord un profil dans une autre agence : ce n'est pas celui que la fiche nomme.
        $this->bailleur = $this->landlordOf($this->moneyAgency());
        OwnerProfile::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agency->id]);
        $this->bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->bailleur->id]);
    }

    private function profilLu(User $lecteur): mixed
    {
        $response = $this->actingAsApi($lecteur)->getJson("/api/properties/{$this->bien->id}")->assertOk();
        $this->assertArrayHasKey('owner_profile_id', $response->json('data'));

        return $response->json('data.owner_profile_id');
    }

    public function test_l_admin_de_l_agence_lit_le_profil_du_bailleur_dans_cette_agence(): void
    {
        $profil = OwnerProfile::query()->where('agency_id', $this->agency->id)->where('user_id', $this->bailleur->id)->sole();

        $id = $this->profilLu($this->agencyAdmin($this->agency));

        $this->assertSame($profil->id, $id);
        // Le lien mène à une fiche qui s'ouvre.
        $this->getJson("/api/owners/{$id}")->assertOk();
    }

    public function test_ni_l_agent_ni_le_bailleur_ne_le_lisent(): void
    {
        $this->assertNull($this->profilLu($this->agencyAgent($this->agency)));
        $this->assertNull($this->profilLu($this->bailleur));
    }

    /** Le super-admin ouvre toute fiche : seul le profil de l'agence DU BIEN se nomme, jamais un autre. */
    public function test_un_profil_d_une_autre_agence_n_est_jamais_nomme(): void
    {
        OwnerProfile::query()->where('agency_id', $this->agency->id)->where('user_id', $this->bailleur->id)->delete();
        $this->apiActingAsRole('super_admin');

        $this->assertNull($this->apiGet("/api/properties/{$this->bien->id}")->assertOk()->json('data.owner_profile_id'));
    }

    public function test_un_bien_sans_agence_n_a_pas_de_profil_de_bailleur(): void
    {
        $this->bien->forceFill(['agency_id' => null])->save();
        $this->apiActingAsRole('super_admin');

        $this->assertNull($this->apiGet("/api/properties/{$this->bien->id}")->assertOk()->json('data.owner_profile_id'));
    }
}
