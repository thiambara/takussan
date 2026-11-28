<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyType;
use App\Models\Lease;
use App\Models\Property;
use Database\Seeders\Activity\BookingPaymentSeeder;
use Database\Seeders\Activity\BookingSeeder;
use Database\Seeders\Activity\InventorySeeder;
use Database\Seeders\Activity\LeasePaymentSeeder;
use Database\Seeders\Activity\LeaseSeeder;
use Database\Seeders\Activity\PropertyVisitSeeder;
use Database\Seeders\Crm\CustomerPipelineStageSeeder;
use Database\Seeders\Engagement\ReviewSeeder;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
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

    /**
     * TCK-2452 — les baux commencent le 1er et finissent le dernier jour d'un mois : le dernier jour
     * de chaque mois, un seed semait un bail `expired` ou `renewed` qui finissait le jour même, et
     * le vérificateur refusait le jeu. Rouge sur toute suite lancée un 31 octobre.
     */
    public function test_un_bail_qui_finit_le_jour_du_seed_est_encore_actif(): void
    {
        $this->travelTo(Carbon::parse('2026-10-31 12:00:00'));

        $this->semer();

        $finissentAujourdhui = Lease::query()->whereDate('end_date', '2026-10-31')->pluck('status');
        // Sans un tel bail, ce test passerait sans rien prouver.
        $this->assertNotEmpty($finissentAujourdhui);
        $this->assertEmpty($finissentAujourdhui->reject(fn (LeaseStatus $statut) => in_array($statut, [LeaseStatus::Active, LeaseStatus::Terminated], true)));
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
            // Ne lit pas les signatures : le rendu des contrats (~0,25 s par bail) est pour JeuSemeTest.
            contratsFiges: false,
        ));
        config(['scout.driver' => null]);

        $this->seed(YearOfActivitySeeder::class);
    }
}
