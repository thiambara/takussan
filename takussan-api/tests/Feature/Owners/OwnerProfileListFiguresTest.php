<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Payout\OwnerStatementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;

/**
 * TCK-2640 — les chiffres d'une ligne du carnet (`GET /api/owners`) : biens, biens occupés, reste à
 * verser (TCK-2760 : le solde cumulé au jour du relevé), dernier versement ; la recherche sans casse ni
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
        return $this->statementOf($landlord, $period)['totals'];
    }

    /** @return array<string, mixed> */
    private function statementOf(User $landlord, string $period = '2026-09'): array
    {
        $previous = auth('sanctum')->user();
        Sanctum::actingAs($landlord);
        $statement = $this->getJson("/api/owner-statements?period={$period}")->assertOk()->json('data');
        Sanctum::actingAs($previous);

        return $statement;
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
     * Le reste à verser de la ligne est celui du relevé du bailleur — encaissé, commission, pénalité
     * de retard, reversement versé. TCK-2760 : c'est le solde cumulé au jour (`balance`), vivant —
     * un relevé envoyé fige ses totaux, pas la ligne du carnet.
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
                $this->statementOf($landlord)['balance']['remaining_to_pay'],
                $rows[$this->profileOf($landlord, $agency)->id]['remaining_to_pay'],
            );
        }
        $this->assertEquals(285000, $rows[$this->profileOf($b, $agency)->id]['remaining_to_pay']);

        // TCK-2760 — le relevé de septembre part ; un loyer encaissé ensuite ne change pas les totaux
        // servis du mois envoyé, mais la ligne suit le solde du jour : + 180 000 (200 000 à 10 %).
        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();
        $sent = $this->rows()[$this->profileOf($a, $agency)->id]['remaining_to_pay'];
        $frozen = $this->statementTotals($a)['remaining_to_pay'];
        $pending->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => '2026-09-19 10:00:00'])->save();
        $this->assertEquals($sent + 180000, $this->rows()[$this->profileOf($a, $agency)->id]['remaining_to_pay']);
        $this->assertEquals($this->statementOf($a)['balance']['remaining_to_pay'], $sent + 180000);
        $this->assertEquals($frozen, $this->statementTotals($a)['remaining_to_pay'], 'les totaux du mois envoyé restent figés');

        // Un brouillon d'invitation n'a pas de relevé.
        $draft = OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id]);
        $this->assertNull($this->rows()[$draft->id]['remaining_to_pay']);
    }

    /**
     * TCK-2641 — « Encaissé ce mois » de la ligne : le brut (`gross`) du relevé servi du mois
     * courant, dans l'agence du profil seulement. Le même bailleur, servi par une autre agence, y
     * encaisse aussi : cela ne compte pas ici. Un loyer d'un autre mois non plus.
     */
    public function test_l_encaisse_du_mois_est_le_brut_du_releve_de_l_agence(): void
    {
        $agency = $this->moneyAgency();
        $other = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $other->id]);

        $here = $this->leaseOf($agency, $landlord, 10);
        $this->leasePayment($here, 250_000);
        $this->leasePayment($here, 90_000, LeasePaymentType::Rent, '2026-08-10 10:00:00');
        $this->leasePayment($this->leaseOf($other, $landlord, 10), 400_000);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->rows()[$this->profileOf($landlord, $agency)->id];
        $gross = $this->getJson("/api/owner-statements?period=2026-09&landlord_id={$landlord->id}")->assertOk()->json('data.totals.gross');
        $this->assertEquals(250000, $gross);
        $this->assertEquals($gross, $row['collected_this_month']);

        // L'autre agence lit son propre encaissé, pas celui de la première.
        $this->apiActingAsRole('agency_admin', ['agency' => $other]);
        $this->assertEquals(400000, $this->rows()[$this->profileOf($landlord, $other)->id]['collected_this_month']);

        // Un brouillon d'invitation n'a pas de relevé.
        $draft = OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id]);
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->assertNull($this->rows()[$draft->id]['collected_this_month']);
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
        $count(); // échauffement : les capacités du rôle se lisent une fois par processus
        $five = $count();
        $seed(25);
        $thirty = $count();

        $this->assertSame($five, $thirty, "5 bailleurs : {$five} requêtes ; 30 : {$thirty}");
    }

    /**
     * TCK-2760 (suivi) — le solde cumulé se calcule UNE fois par agence et par requête : le filtre
     * `has_remaining`, le tri, la ligne et la somme de tête le relisent. Chaque passe relit la fenêtre
     * cumulée depuis `BALANCE_ORIGIN` : on compte les requêtes qui la lient, contre une passe directe de
     * `balances()` (mesuré avant : 4 passes avec le filtre et le tri, 1035-2058 ms sur la démo). Une
     * seconde requête recalcule : la mémoire ne survit pas à la requête.
     */
    public function test_les_soldes_se_calculent_une_fois_par_requete(): void
    {
        $agency = $this->moneyAgency();
        $landlords = [$this->landlordOf($agency), $this->landlordOf($agency), $this->landlordOf($agency)];
        foreach ($landlords as $i => $landlord) {
            $this->leasePayment($this->leaseOf($agency, $landlord, 10), 100_000 * ($i + 1));
        }
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $passes = 0;
        DB::listen(function ($q) use (&$passes): void {
            foreach ($q->bindings as $binding) {
                if (str_starts_with((string) $binding, OwnerStatementService::BALANCE_ORIGIN)) {
                    $passes++;

                    return;
                }
            }
        });

        app(OwnerStatementService::class)->balances($agency, array_map(fn (User $u): int => (int) $u->id, $landlords));
        $unePasse = $passes;
        $this->assertGreaterThan(0, $unePasse, 'la sonde voit la fenêtre cumulée');

        $passes = 0;
        $this->apiGet('/api/owners?per_page=1&filter[has_remaining]=1&sort=-remaining_to_pay')->assertOk()
            ->assertJsonPath('meta.summary.with_remaining', 3);
        $this->assertSame($unePasse, $passes, 'une seule passe des soldes pour le filtre, le tri, la ligne et la somme');

        $passes = 0;
        $this->apiGet('/api/owners?per_page=1&sort=-remaining_to_pay')->assertOk();
        $this->assertSame($unePasse, $passes, 'la requête suivante recalcule : rien ne survit à la requête');

        // Une recherche restreint les lignes, pas le résumé : le périmètre du résumé, le plus large, se
        // calcule d'abord, et la recherche le relit (sinon : une passe pour elle, une pour le reste).
        $passes = 0;
        $this->apiGet('/api/owners?per_page=1&filter[has_remaining]=1&sort=-remaining_to_pay&filter[search]='.urlencode($landlords[0]->email))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.summary.with_remaining', 3);
        $this->assertSame($unePasse, $passes, 'une recherche ne coûte pas une seconde passe');
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

        $count(); // échauffement : les capacités du rôle se lisent une fois par processus
        $alone = $count();
        $other = $this->moneyAgency();
        for ($i = 0; $i < 3; $i++) {
            $this->leasePayment($this->leaseOf($other, $this->landlordOf($other), 10), 100_000);
        }
        $this->moneyAgency(); // une troisième, vide

        $this->assertSame($alone, $count());
    }

    /**
     * Vérification adverse de TCK-2640 — les chiffres d'argent de la liste suivent la règle du
     * relevé : un agent qui lit le carnet sans `payouts.create` (relevé : 403) ne lit ni le reste à
     * verser, ni le dernier versement, et ni le filtre ni le tri par reste ne les trahissent.
     */
    public function test_l_agent_sans_payouts_create_ne_lit_pas_les_chiffres_d_argent(): void
    {
        $agency = $this->moneyAgency();
        $small = $this->landlordOf($agency);
        $big = $this->landlordOf($agency);
        $this->leasePayment($this->leaseOf($agency, $small, 10), 100_000);
        $this->leasePayment($this->leaseOf($agency, $big, 10), 500_000);
        Payout::factory()->create([
            'agency_id' => $agency->id, 'landlord_id' => $big->id, 'payee_role' => PayeeRole::Landlord,
            'status' => PayoutStatus::Completed, 'processed_at' => '2026-09-10 09:00:00',
        ]);

        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PaymentsRecord, Capability::CrmViewAll])
            ->create(['agency_id' => $agency->id]);
        $agent = User::factory()->withTwoFactor()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'agency_role_id' => $role->id]);
        $agent = $agent->fresh();
        $this->assertFalse($agent->canActAt(Capability::PayoutsCreate, $agency));

        Sanctum::actingAs($agent);
        $this->getJson("/api/owner-statements?period=2026-09&landlord_id={$big->id}")->assertForbidden();

        $rows = $this->rows();
        $this->assertCount(2, $rows);
        foreach ($rows as $row) {
            $this->assertNull($row['remaining_to_pay']);
            $this->assertNull($row['last_payout_at']);
            $this->assertNull($row['collected_this_month']);
        }
        $this->assertSame([], $this->rows('&filter[has_remaining]=1'));
        $this->assertCount(2, $this->rows('&filter[has_remaining]=0'));
        // Le tri par reste ne range plus que par id, dans les deux sens : il ne dit rien des montants.
        $parId = [$this->profileOf($small, $agency)->id, $this->profileOf($big, $agency)->id];
        sort($parId);
        foreach (['remaining_to_pay', '-remaining_to_pay'] as $tri) {
            $this->assertSame($parId, collect($this->getJson("/api/owners?per_page=100&sort={$tri}")->assertOk()->json('data'))->pluck('id')->all(), $tri);
        }

        // L'admin de l'agence, qui tient le relevé, lit les deux chiffres.
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->rows()[$this->profileOf($big, $agency)->id];
        $this->assertNotNull($row['remaining_to_pay']);
        $this->assertSame('2026-09-10T09:00:00+00:00', $row['last_payout_at']);
    }
}
