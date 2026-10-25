<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use Database\Seeders\Activity\BookingPaymentSeeder;
use Database\Seeders\Activity\BookingSeeder;
use Database\Seeders\Activity\InventorySeeder;
use Database\Seeders\Activity\LeasePaymentSeeder;
use Database\Seeders\Activity\LeaseSeeder;
use Database\Seeders\Activity\PropertyVisitSeeder;
use Database\Seeders\Crm\CustomerPipelineStageSeeder;
use Database\Seeders\Engagement\ReviewSeeder;
use Database\Seeders\Support\ReferentialIntegrityChecker;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionClassConstant;
use Tests\TestCase;

/**
 * TCK-2377 — le seed suit le parcours d'un client, dans l'ordre du temps, au lieu de tirer chaque
 * table au hasard.
 *
 * Mesuré le 2026-10-25 sur un seed par défaut : 76 biens à deux baux actifs, 273 baux antérieurs à
 * leur bien, 92 locataires `lead`, 286 avis écrits par le personnel de l'agence, 273 impayés jamais
 * régularisés et aucun garant rattaché à un bail.
 */
class SeedingJourneyTest extends TestCase
{
    use RefreshDatabase;

    /** Les invariants que ce ticket ajoute au vérificateur. */
    private const INVARIANTS = [
        'bien_occupe_par_deux_baux_qui_se_chevauchent',
        'bail_anterieur_a_son_bien',
        'visite_anterieure_a_son_bien',
        'reservation_anterieure_a_son_bien',
        'bail_expire_dont_la_fin_est_a_venir',
        'bail_actif_dont_la_fin_est_passee',
        'bail_renouvele_sans_successeur',
        'locataire_qui_n_est_pas_converti',
        'lead_qui_a_un_bail',
        'avis_ecrit_par_le_personnel_ou_le_bailleur',
        'impaye_de_plus_de_90_jours_sur_un_bail_actif',
        'maintenance_sur_un_bien_non_bati',
        'maintenance_demandee_ni_par_le_locataire_ni_par_le_bailleur',
    ];

    public function test_le_jeu_seme_raconte_des_parcours_coherents(): void
    {
        $this->semer();

        $violations = (new ReferentialIntegrityChecker)->violations();
        $this->assertSame(
            array_fill_keys(self::INVARIANTS, 0),
            array_intersect_key($violations, array_flip(self::INVARIANTS)),
        );

        // NON-VACUITÉ : chaque issue d'un bail existe, sans quoi les zéros ci-dessus ne disent rien.
        foreach ([LeaseStatus::Active, LeaseStatus::Expired, LeaseStatus::Renewed, LeaseStatus::Terminated, LeaseStatus::Draft] as $statut) {
            $this->assertGreaterThan(0, Lease::query()->where('status', $statut)->count(), "Aucun bail {$statut->value}.");
        }
        $this->assertGreaterThan(0, DB::table('reviews')->count(), 'Aucun avis : l\'invariant des auteurs n\'est pas exercé.');
        $this->assertGreaterThan(0, DB::table('maintenance_requests')->whereNotNull('lease_id')->count(), 'Aucune intervention signalée pendant un bail.');

        // Un renouvellement reprend le même locataire et le même bien, et commence le lendemain.
        $renouvellement = Lease::query()->whereNotNull('renewed_from_lease_id')->with('renewedFrom')->firstOrFail();
        $this->assertSame($renouvellement->renewedFrom->tenant_id, $renouvellement->tenant_id);
        $this->assertSame($renouvellement->renewedFrom->property_id, $renouvellement->property_id);
        $this->assertSame($renouvellement->renewedFrom->end_date->addDay()->toDateString(), $renouvellement->start_date->toDateString());

        // AC4 : le stade CRM se lit dans l'activité.
        $this->assertSame(0, DB::table('leases')->join('customers', 'customers.id', '=', 'leases.tenant_id')
            ->where('leases.status', LeaseStatus::Active->value)
            ->where('customers.pipeline_stage', '!=', CustomerPipelineStage::Converted->value)->count());
        $this->assertGreaterThan(0, DB::table('customers')->where('pipeline_stage', CustomerPipelineStage::Lead->value)->count());

        // AC6 : un impayé a une suite — au moins un loyer réglé en retard, pénalité comprise.
        $this->assertGreaterThan(0, LeasePayment::query()
            ->where('payment_type', LeasePaymentType::Rent)
            ->where('status', PaymentStatus::Paid)
            ->where('late_fee_amount', '>', 0)
            ->whereColumn('paid_at', '>', 'due_date')
            ->count());

        // AC7 : au moins un bail signé sur cinq a un garant.
        $signes = Lease::query()->where('status', '!=', LeaseStatus::Draft)->count();
        $avecGarant = DB::table('lease_guarantor')->distinct()->count('lease_id');
        $this->assertGreaterThanOrEqual(0.2, $avecGarant / $signes, "{$avecGarant} baux signés sur {$signes} ont un garant.");
    }

    public function test_l_etat_des_lieux_decrit_les_pieces_du_bien(): void
    {
        $studio = Property::factory()->make(['type' => PropertyType::Studio, 'bedrooms' => 0, 'bathrooms' => 1]);
        $bureau = Property::factory()->make(['type' => PropertyType::Office, 'bedrooms' => 0, 'bathrooms' => 1]);
        $villa = Property::factory()->make(['type' => PropertyType::Villa, 'bedrooms' => 4, 'bathrooms' => 2]);

        $this->assertNotContains('Chambre principale', InventorySeeder::piecesDuBien($studio));
        $this->assertEmpty(preg_grep('/^Chambre/', InventorySeeder::piecesDuBien($studio)));
        $this->assertEmpty(preg_grep('/Cuisine/', InventorySeeder::piecesDuBien($bureau)));
        $this->assertCount(4, preg_grep('/^Chambre/', InventorySeeder::piecesDuBien($villa)));
    }

    public function test_les_etats_des_lieux_semes_suivent_le_type_du_bien(): void
    {
        $this->semer();

        $inventaires = Inventory::query()->with('property')->get();
        $this->assertNotEmpty($inventaires);
        foreach ($inventaires as $inventaire) {
            $this->assertSame(
                InventorySeeder::piecesDuBien($inventaire->property),
                array_column($inventaire->rooms, 'name'),
                "L'état des lieux {$inventaire->id} ne décrit pas les pièces du bien {$inventaire->property->type->value}.",
            );
        }
        // Les pièces varient d'un bien à l'autre : le défaut était quatre pièces partout.
        $this->assertGreaterThan(1, $inventaires->map(fn (Inventory $i) => count($i->rooms))->unique()->count());
    }

    public function test_chaque_etape_du_parcours_est_semee_apres_celles_dont_elle_depend(): void
    {
        $pipeline = (new ReflectionClassConstant(YearOfActivitySeeder::class, 'PIPELINE'))->getValue();
        $rang = fn (string $classe) => array_search($classe, $pipeline, true);

        // Un bail sur trois naît d'une réservation, dont l'acompte se paie avec les autres.
        $this->assertLessThan($rang(BookingPaymentSeeder::class), $rang(LeaseSeeder::class));
        $this->assertLessThan($rang(LeasePaymentSeeder::class), $rang(LeaseSeeder::class));
        // Le stade CRM et les avis se lisent dans les visites, réservations et baux.
        foreach ([PropertyVisitSeeder::class, BookingSeeder::class, LeaseSeeder::class] as $amont) {
            $this->assertLessThan($rang(CustomerPipelineStageSeeder::class), $rang($amont));
            $this->assertLessThan($rang(ReviewSeeder::class), $rang($amont));
        }
    }

    private function semer(): void
    {
        app()->instance(SeedingConfig::class, new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 60,
            customersPerAgency: 60,
            bookingsPerAgency: 15,
            leasesPerAgency: 40,
            maintenanceRequestsPerAgency: 12,
            conversationsPerAgency: 2,
            documentsPerAgency: 2,
            includeDemoUsers: false,
        ));
        config(['scout.driver' => null]);

        $this->seed(YearOfActivitySeeder::class);
    }
}
