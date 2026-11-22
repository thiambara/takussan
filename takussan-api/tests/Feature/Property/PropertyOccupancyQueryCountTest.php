<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2637, AC6 — `GET /api/properties?include=occupancy` coûte le même nombre de requêtes pour 10
 * biens et pour 50, vu du personnel comme du bailleur. Le jeu mêle ce que le bloc lit par ligne :
 * retard avec pénalité encaissable en ligne (`amountDue` lit l'agence du bail), loyer payé, préavis,
 * vacance après un bail et bien jamais loué.
 */
class PropertyOccupancyQueryCountTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    private int $n = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->agency->forceFill(['settings' => ['late_fee_online_collection' => true]])->save();
        $this->owner = $this->bailleur($this->agency);
    }

    /** Cinq biens, un de chaque forme. */
    private function lot(): void
    {
        $bien = fn () => $this->bienLoue($this->agency, $this->owner, 'Bien '.(++$this->n), ['visibility' => 'public', 'published_at' => '2026-10-01 10:00:00']);
        $this->loyer($this->bail($bien(), 'Moussa Fall'), '2026-11-05', PaymentStatus::Late, ['late_fee_amount' => 15_000, 'late_fee_applied_at' => '2026-11-08 00:00:00']);
        $this->loyer($this->bail($bien(), 'Awa Ndiaye'), '2026-11-05', PaymentStatus::Paid);
        $this->bail($bien(), 'Fatou Diop', ['status' => LeaseStatus::Terminating]);
        $this->bail($bien(), 'Ancien Locataire', ['status' => LeaseStatus::Expired, 'end_date' => '2026-09-30']);
        $bien();
    }

    private function requetes(User $user, int $expected): int
    {
        $this->actingAsApi($user);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $response = $this->getJson('/api/properties?per_page=50&include=occupancy,online&fields[properties]=id,title,agency_id,user_id&sort=retard')->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertCount($expected, $response->json('data'));
        $first = $response->json('data.0');
        $this->assertSame('late', $first['occupancy']['current_month']['status']);
        $this->assertIsBool($first['is_online'], 'is_online est bien calculé pour la page (include=online)');
        $this->assertEquals(315000, $first['occupancy']['current_month']['amount_due'], 'la pénalité encaissable en ligne compte dans le dû');

        return $count;
    }

    public function test_ac6_dix_et_cinquante_biens_coutent_autant(): void
    {
        $staff = $this->agencyAdmin($this->agency);
        $this->lot();
        $this->lot();
        $this->requetes($staff, 10);
        $tenStaff = $this->requetes($staff, 10);
        $tenOwner = $this->requetes($this->owner, 10);

        foreach (range(1, 8) as $_) {
            $this->lot();
        }

        $this->assertSame($tenStaff, $this->requetes($staff, 50), 'personnel');
        $this->assertSame($tenOwner, $this->requetes($this->owner, 50), 'bailleur');
    }
}
