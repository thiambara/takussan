<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2638 (lot B2) — la pastille « Boostée » de la carte d'annonce : décision du porteur, une mise en
 * avant payée EN COURS, `sponsored_until` > maintenant. La liste pro la reçoit par `fields[properties]`
 * (ISO 8601, nulle sans boost) ; la surface publique ne l'émet pas — la fin d'un boost n'est pas une
 * donnée du catalogue.
 */
class BoostEnCoursDansLaListeTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private const EN_LIGNE = ['visibility' => 'public', 'published_at' => '2026-10-01 10:00:00'];

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-12 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $owner = $this->bailleur($this->agency);
        $this->bienLoue($this->agency, $owner, 'Boostée', self::EN_LIGNE + ['sponsored_until' => '2026-11-18 23:59:59']);
        $this->bienLoue($this->agency, $owner, 'Sans boost', self::EN_LIGNE);
    }

    public function test_la_liste_pro_recoit_la_fin_du_boost_quand_elle_la_demande(): void
    {
        $this->actingAsApi($this->admin);
        $lignes = collect($this->getJson('/api/properties?fields[properties]=id,title,sponsored_until')->assertOk()->json('data'))
            ->keyBy('title');

        $this->assertSame('2026-11-18T23:59:59+00:00', $lignes['Boostée']['sponsored_until']);
        $this->assertArrayHasKey('sponsored_until', $lignes['Sans boost']);
        $this->assertNull($lignes['Sans boost']['sponsored_until']);
    }

    public function test_sans_la_demander_la_cle_est_absente_pas_nulle(): void
    {
        $this->actingAsApi($this->admin);
        $ligne = $this->getJson('/api/properties?fields[properties]=id,title')->assertOk()->json('data.0');

        $this->assertArrayNotHasKey('sponsored_until', $ligne);
    }

    public function test_la_surface_publique_ne_l_emet_pas(): void
    {
        $lignes = $this->getJson('/api/public/properties')->assertOk()->json('data');

        $this->assertNotEmpty($lignes);
        foreach ($lignes as $ligne) {
            $this->assertArrayNotHasKey('sponsored_until', $ligne);
        }
    }
}
