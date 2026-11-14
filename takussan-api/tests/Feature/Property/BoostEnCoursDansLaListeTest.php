<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
 *
 * Correctif de la vérification adverse (d1) : elle ne sort qu'au personnel de l'agence du bien et à
 * son bailleur. Un locataire (`/api/leases?include=property`) et un candidat
 * (`/api/bookings?include=property`) reçoivent le bien imbriqué avec toutes ses colonnes : la clé
 * n'y paraît pas.
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

    private User $owner;

    private Property $boostee;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-12 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->owner = $owner = $this->bailleur($this->agency);
        $this->boostee = $this->bienLoue($this->agency, $owner, 'Boostée', self::EN_LIGNE + ['sponsored_until' => '2026-11-18 23:59:59']);
        $this->bienLoue($this->agency, $owner, 'Sans boost', self::EN_LIGNE);
    }

    public function test_la_liste_pro_recoit_la_fin_du_boost_quand_elle_la_demande(): void
    {
        $this->actingAsApi($this->admin);
        // Les colonnes de `DASHBOARD_PROPERTY_FIELDS` : `agency_id` et `user_id` y sont, et c'est sur
        // eux que l'appelant est jugé (personnel de l'agence du bien, ou son bailleur).
        $lignes = collect($this->getJson('/api/properties?fields[properties]=id,user_id,agency_id,title,sponsored_until')->assertOk()->json('data'))
            ->keyBy('title');

        $this->assertSame('2026-11-18T23:59:59+00:00', $lignes['Boostée']['sponsored_until']);
        $this->assertArrayHasKey('sponsored_until', $lignes['Sans boost']);
        $this->assertNull($lignes['Sans boost']['sponsored_until']);
    }

    public function test_sans_l_agence_du_bien_le_personnel_n_est_pas_juge_et_la_cle_reste_absente(): void
    {
        // La règle penche du côté qui ne divulgue pas : sans `agency_id`, rien ne dit que l'appelant
        // est du personnel de CETTE agence.
        $this->actingAsApi($this->admin);
        $ligne = $this->getJson('/api/properties?fields[properties]=id,title,sponsored_until')->assertOk()->json('data.0');

        $this->assertArrayNotHasKey('sponsored_until', $ligne);
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

    public function test_le_bailleur_du_bien_la_recoit(): void
    {
        $this->actingAsApi($this->owner);
        $lignes = collect($this->getJson('/api/properties?fields[properties]=id,user_id,agency_id,title,sponsored_until')->assertOk()->json('data'))
            ->keyBy('title');

        $this->assertSame('2026-11-18T23:59:59+00:00', $lignes['Boostée']['sponsored_until']);
    }

    public function test_le_locataire_ne_la_recoit_pas_par_son_bail(): void
    {
        $locataire = User::factory()->create();
        $bail = $this->bail($this->boostee, 'Awa Locataire');
        $bail->tenant->update(['user_id' => $locataire->id]);

        $this->actingAsApi($locataire);
        $liste = $this->getJson('/api/leases?include=property')->assertOk()->json('data');
        $this->assertCount(1, $liste);
        $this->assertSame('Boostée', $liste[0]['property']['title'], 'le bien est bien servi au locataire');
        $this->assertArrayNotHasKey('sponsored_until', $liste[0]['property']);

        $fiche = $this->getJson("/api/leases/{$bail->id}?include=property")->assertOk()->json('data.property');
        $this->assertSame('Boostée', $fiche['title']);
        $this->assertArrayNotHasKey('sponsored_until', $fiche);
    }

    public function test_le_candidat_ne_la_recoit_pas_par_sa_reservation(): void
    {
        $candidat = User::factory()->create();
        Booking::factory()->create([
            'property_id' => $this->boostee->id,
            'agency_id' => $this->agency->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $candidat->id])->id,
            'created_by_id' => $candidat->id,
        ]);

        $this->actingAsApi($candidat);
        $liste = $this->getJson('/api/bookings?include=property')->assertOk()->json('data');
        $this->assertCount(1, $liste);
        $this->assertSame('Boostée', $liste[0]['property']['title'], 'le bien est bien servi au candidat');
        $this->assertArrayNotHasKey('sponsored_until', $liste[0]['property']);
    }

    public function test_juger_le_personnel_ne_coute_pas_une_requete_par_bien(): void
    {
        $this->actingAsApi($this->admin);
        $compter = function (): int {
            $compte = 0;
            DB::listen(function () use (&$compte) {
                $compte++;
            });
            $this->getJson('/api/properties?per_page=50&fields[properties]=id,user_id,agency_id,title,sponsored_until')->assertOk();

            return $compte;
        };

        $avant = $compter();
        $owner = $this->bailleur($this->agency);
        foreach (range(1, 6) as $i) {
            $this->bienLoue($this->agency, $owner, "Boostée {$i}", self::EN_LIGNE + ['sponsored_until' => '2026-11-20 23:59:59']);
        }
        $this->app->forgetInstance('db');

        $this->assertSame($avant, $compter(), 'six biens boostés de plus, autant de requêtes');
    }
}
