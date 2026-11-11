<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;

/**
 * TCK-2640 — les chiffres d'une ligne du carnet (`GET /api/owners`) : biens, biens occupés, reste à
 * verser du mois courant (celui du relevé servi), dernier versement ; la recherche sans casse ni
 * accents ; `filter[has_remaining]` ; les tris `name` et `-remaining_to_pay` ; un nombre de requêtes
 * qui ne dépend pas de la taille de la page.
 */
class OwnerProfileListFiguresTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-09-20 10:00:00');
    }

    /** @return array<int, array<string, mixed>> par id de profil */
    private function rows(string $query = ''): array
    {
        return collect($this->apiGet('/api/owners?per_page=100'.$query)->assertOk()->json('data'))->keyBy('id')->all();
    }

    private function profileOf(User $landlord, Agency $agency): OwnerProfile
    {
        return OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->firstOrFail();
    }

    private function statementTotals(User $landlord, string $period = '2026-09'): array
    {
        $previous = auth('sanctum')->user();
        Sanctum::actingAs($landlord);
        $totals = $this->getJson("/api/owner-statements?period={$period}")->assertOk()->json('data.totals');
        Sanctum::actingAs($previous);

        return $totals;
    }

    public function test_les_comptes_de_biens_et_le_dernier_versement(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $this->leaseOf($agency, $landlord); // occupé
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id]); // vacant
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id, 'archived_at' => now()]); // archivé
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id])->delete(); // supprimé
        Property::factory()->create(['user_id' => $landlord->id]); // autre agence
        // Un bail terminé ne fait pas un bien occupé.
        $ended = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id]);
        Lease::factory()->create(['property_id' => $ended->id, 'agency_id' => $agency->id, 'landlord_id' => $landlord->id, 'status' => LeaseStatus::Terminated, 'start_date' => '2025-01-01', 'end_date' => '2026-01-01']);
        // Un bail en brouillon, couvrant pourtant le jour, non plus.
        $drafted = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id]);
        Lease::factory()->create(['property_id' => $drafted->id, 'agency_id' => $agency->id, 'landlord_id' => $landlord->id, 'status' => LeaseStatus::Draft, 'start_date' => '2026-09-01', 'end_date' => '2027-08-31']);

        $payout = fn (array $a) => Payout::factory()->create($a + ['agency_id' => $agency->id, 'landlord_id' => $landlord->id, 'payee_role' => PayeeRole::Landlord]);
        $payout(['status' => PayoutStatus::Completed, 'processed_at' => '2026-08-31 09:00:00']);
        $payout(['status' => PayoutStatus::Completed, 'processed_at' => '2026-09-10 09:00:00']);
        // Plus récents, mais hors de portée : annulé, payé au locataire, autre agence.
        $payout(['status' => PayoutStatus::Cancelled, 'processed_at' => '2026-09-15 09:00:00']);
        $payout(['status' => PayoutStatus::Completed, 'processed_at' => '2026-09-16 09:00:00', 'payee_role' => PayeeRole::Tenant]);
        $payout(['status' => PayoutStatus::Completed, 'processed_at' => '2026-09-17 09:00:00', 'agency_id' => $this->moneyAgency()->id]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->rows()[$this->profileOf($landlord, $agency)->id];

        $this->assertSame(4, $row['properties_count']);
        $this->assertSame(1, $row['occupied_properties_count']);
        $this->assertSame('2026-09-10T09:00:00+00:00', $row['last_payout_at']);
    }

    /**
     * Le reste à verser de la ligne est celui du relevé du bailleur pour le mois courant — encaissé,
     * commission, pénalité de retard, reversement versé — et, un mois dont le relevé est parti, celui
     * de l'instantané envoyé.
     */
    public function test_le_reste_a_verser_est_celui_du_releve_servi(): void
    {
        $agency = $this->moneyAgency();
        $a = $this->landlordOf($agency);
        $b = $this->landlordOf($agency);
        $leaseA = $this->leaseOf($agency, $a, 10);
        [, , , $pending] = $this->septemberOf($leaseA);
        // Une pénalité de retard réglée : elle entre au relevé, et donc au reste à verser.
        $this->leasePayment($leaseA, 200_000, LeasePaymentType::Rent, '2026-09-14 10:00:00')->forceFill([
            'late_fee_amount' => 15_000, 'late_fee_applied_at' => '2026-09-08 00:00:00', 'late_fee_paid_at' => '2026-09-14 10:00:00',
        ])->save();
        $this->leasePayment($this->leaseOf($agency, $b, 5), 300_000);
        Payout::factory()->create(['agency_id' => $agency->id, 'landlord_id' => $a->id, 'payee_role' => PayeeRole::Landlord, 'status' => PayoutStatus::Completed, 'processed_at' => '2026-09-18 09:00:00', 'net_amount' => 120_000]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $rows = $this->rows();
        foreach ([$a, $b] as $landlord) {
            $this->assertEquals(
                $this->statementTotals($landlord)['remaining_to_pay'],
                $rows[$this->profileOf($landlord, $agency)->id]['remaining_to_pay'],
            );
        }
        $this->assertEquals(285000, $rows[$this->profileOf($b, $agency)->id]['remaining_to_pay']);

        // Le relevé de septembre part ; un loyer encaissé ensuite ne change pas le chiffre servi.
        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();
        $sent = $this->rows()[$this->profileOf($a, $agency)->id]['remaining_to_pay'];
        $pending->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => '2026-09-19 10:00:00'])->save();
        $this->assertEquals($sent, $this->rows()[$this->profileOf($a, $agency)->id]['remaining_to_pay']);
        $this->assertEquals($this->statementTotals($a)['remaining_to_pay'], $sent);

        // Un brouillon d'invitation n'a pas de relevé.
        $draft = OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id]);
        $this->assertNull($this->rows()[$draft->id]['remaining_to_pay']);
    }

    public function test_filtre_has_remaining_et_tri_par_reste_a_verser(): void
    {
        $agency = $this->moneyAgency();
        $small = $this->landlordOf($agency);
        $big = $this->landlordOf($agency);
        $none = $this->landlordOf($agency);
        $this->leasePayment($this->leaseOf($agency, $small, 10), 100_000);
        $this->leasePayment($this->leaseOf($agency, $big, 10), 500_000);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $with = array_keys($this->rows('&filter[has_remaining]=1'));
        $this->assertEqualsCanonicalizing([$this->profileOf($small, $agency)->id, $this->profileOf($big, $agency)->id], $with);
        $without = array_keys($this->rows('&filter[has_remaining]=0'));
        $this->assertContains($this->profileOf($none, $agency)->id, $without);
        $this->assertNotContains($this->profileOf($big, $agency)->id, $without);

        $ids = collect($this->apiGet('/api/owners?per_page=100&sort=-remaining_to_pay')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$this->profileOf($big, $agency)->id, $this->profileOf($small, $agency)->id], array_slice($ids, 0, 2));

        // Le tri porte sur tout le périmètre, pas sur la page : le plus gros reste en tête de la page 1.
        $first = $this->apiGet('/api/owners?per_page=1&sort=-remaining_to_pay')->assertOk();
        $this->assertSame($this->profileOf($big, $agency)->id, $first->json('data.0.id'));
        // P216.05 (ADR-0075) — une liste vaut un filtre absent : toutes les lignes.
        $this->assertCount(count($with) + count($without), $this->rows('&filter[has_remaining]=1,0'));
    }

    /** AC5 — « sene » trouve « Mouhamed SÈNE » ; le nom saisi à l'invitation et le téléphone aussi. */
    public function test_la_recherche_ignore_casse_et_accents(): void
    {
        $agency = $this->moneyAgency();
        $sene = OwnerProfile::factory()->create(['agency_id' => $agency->id, 'user_id' => User::factory()->create(['first_name' => 'Mouhamed', 'last_name' => 'SÈNE'])->id]);
        $draft = OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id, 'metadata' => ['first_name' => 'Aïssatou', 'last_name' => 'Ndiaye', 'phone' => '+221 77 123 45 67']]);
        $foreign = OwnerProfile::factory()->create(['user_id' => User::factory()->create(['last_name' => 'Sène'])->id]);
        $other = OwnerProfile::factory()->create(['agency_id' => $agency->id, 'user_id' => User::factory()->create(['first_name' => 'Fatou', 'last_name' => 'Diop'])->id]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertSame([$sene->id], array_keys($this->rows('&filter[search]=sene')));
        $this->assertSame([$sene->id], array_keys($this->rows('&filter[search]='.urlencode('mouhamed sène'))));
        $this->assertSame([$draft->id], array_keys($this->rows('&filter[search]=aissatou')));
        $this->assertSame([$draft->id], array_keys($this->rows('&filter[search]=771234567')));
        $this->assertArrayNotHasKey($foreign->id, $this->rows('&filter[search]=sene'));
        $this->assertArrayHasKey($other->id, $this->rows('&filter[search]='));
    }

    public function test_le_tri_par_nom(): void
    {
        $agency = $this->moneyAgency();
        $make = fn (string $last) => OwnerProfile::factory()->create(['agency_id' => $agency->id, 'user_id' => User::factory()->create(['first_name' => 'Zz', 'last_name' => $last])->id]);
        $sow = $make('Sow');
        $ba = $make('Ba');
        $draft = OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id, 'metadata' => ['first_name' => 'Zz', 'last_name' => 'Ndiaye']]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $ids = collect($this->apiGet('/api/owners?per_page=100&sort=name&filter[search]=zz')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$ba->id, $draft->id, $sow->id], $ids);
        $desc = collect($this->apiGet('/api/owners?per_page=100&sort=-name&filter[search]=zz')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$sow->id, $draft->id, $ba->id], $desc);
    }

    /** AC6 — 5 bailleurs ou 30, la page coûte le même nombre de requêtes. */
    public function test_le_nombre_de_requetes_ne_depend_pas_de_la_taille_de_la_page(): void
    {
        $agency = $this->moneyAgency();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->apiGet('/api/owners?per_page=100&include=user')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };
        $seed = function (int $n) use ($agency): void {
            for ($i = 0; $i < $n; $i++) {
                $landlord = $this->landlordOf($agency);
                $lease = $this->leaseOf($agency, $landlord, 10);
                $this->leasePayment($lease, 100_000);
                Payout::factory()->create(['agency_id' => $agency->id, 'landlord_id' => $landlord->id, 'payee_role' => PayeeRole::Landlord, 'status' => PayoutStatus::Completed, 'processed_at' => '2026-09-12 09:00:00', 'net_amount' => 10_000]);
            }
        };

        $seed(5);
        $five = $count();
        $seed(25);
        $thirty = $count();

        $this->assertSame($five, $thirty, "5 bailleurs : {$five} requêtes ; 30 : {$thirty}");
    }

    /**
     * Le filtre et le tri par reste à verser jugent le périmètre de l'agence, pas la plateforme : une
     * autre agence peuplée n'ajoute aucune requête (le relevé se calcule par agence).
     */
    public function test_filtre_et_tri_par_reste_ne_calculent_que_l_agence_de_l_appelant(): void
    {
        $agency = $this->moneyAgency();
        $this->leasePayment($this->leaseOf($agency, $this->landlordOf($agency), 10), 100_000);
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->apiGet('/api/owners?per_page=100&filter[has_remaining]=1&sort=-remaining_to_pay&filter[search]=a')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $alone = $count();
        $other = $this->moneyAgency();
        for ($i = 0; $i < 3; $i++) {
            $this->leasePayment($this->leaseOf($other, $this->landlordOf($other), 10), 100_000);
        }
        $this->moneyAgency(); // une troisième, vide

        $this->assertSame($alone, $count());
    }
}
