<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2642 — la liste des baux, avec tout ce que la page « Baux » demande (`attention`, résumé
 * d'échéance, parties nommées), se sert en un nombre de requêtes qui ne dépend pas du nombre de
 * lignes ; et le résumé d'échéance, les parties et le plafond de révision portent ce qu'ils disent.
 */
class LeaseIndexQueryCountTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private const PAGE = '/api/leases?per_page=50&sort=attention&include=attention,due_summary,landlord,agent,tenant,property';

    private Agency $agency;

    private User $owner;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->owner = $this->bailleur($this->agency, ['first_name' => 'Aminata', 'last_name' => 'DIALLO', 'phone' => '+221770000001']);
        $this->agent = $this->agencyAgent($this->agency);
    }

    private function leases(int $n): void
    {
        for ($i = 0; $i < $n; $i++) {
            $lease = $this->bail($this->bienLoue($this->agency, $this->owner, "Bien {$i}"), "Loc N{$i}", ['agent_id' => $this->agent->id, 'end_date' => '2027-01-31']);
            $this->loyer($lease, '2026-10-05', PaymentStatus::Pending);
            $this->loyer($lease, '2026-12-05', PaymentStatus::Pending);
        }
    }

    private function queriesFor(User $as): int
    {
        $this->actingAsApi($as);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson(self::PAGE)->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_baux(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $this->leases(1);
        $this->queriesFor($admin); // la première requête amorce des caches de processus (réglages…)
        $this->leases(9);
        $ten = $this->queriesFor($admin);
        $this->leases(20);
        $thirty = $this->queriesFor($admin);

        $this->assertSame($ten, $thirty, "10 baux : {$ten} requêtes ; 30 baux : {$thirty}");
    }

    public function test_le_resume_d_echeance(): void
    {
        $lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'Bien'), 'Loc RESUME');
        $this->loyer($lease, '2026-09-05', PaymentStatus::Pending);
        $this->loyer($lease, '2026-10-05', PaymentStatus::PartiallyPaid, ['metadata' => ['paid_amount' => 100_000]]);
        $this->loyer($lease, '2026-11-15', PaymentStatus::Pending);
        $this->loyer($lease, '2026-12-05', PaymentStatus::Pending);
        $this->loyer($lease, '2026-08-05', PaymentStatus::Paid);
        $bare = $this->bail($this->bienLoue($this->agency, $this->owner, 'Nu'), 'Loc NU');

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $data = $this->getJson("/api/leases/{$lease->id}?include=due_summary")->assertOk()->json('data');
        $this->assertSame(['due_date' => '2026-11-15', 'amount' => 300000, 'status' => 'pending'], array_map(fn ($v) => is_float($v) ? (int) $v : $v, $data['next_due']));
        $this->assertSame(2, $data['overdue_count']);
        $this->assertEquals(500_000, $data['overdue_amount'], 'au reste dû : 300 000 + 200 000');

        $none = $this->getJson("/api/leases/{$bare->id}?include=due_summary")->assertOk()->json('data');
        $this->assertNull($none['next_due']);
        $this->assertSame(0, $none['overdue_count']);
        $this->assertArrayNotHasKey('next_due', $this->getJson("/api/leases/{$lease->id}")->json('data'));
    }

    /** Le bailleur nommé ; son téléphone pour le personnel et pour lui-même, jamais pour le seul locataire. */
    public function test_les_parties_nommees_et_le_telephone_du_bailleur(): void
    {
        $tenantUser = User::factory()->create();
        $lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'Bien'), 'Loc PARTIE', ['agent_id' => $this->agent->id]);
        $lease->tenant->update(['user_id' => $tenantUser->id]);
        $url = "/api/leases/{$lease->id}?include=landlord,agent";

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $data = $this->getJson($url)->assertOk()->json('data');
        $this->assertSame(['id' => $this->owner->id, 'first_name' => 'Aminata', 'last_name' => 'DIALLO', 'full_name' => 'Aminata DIALLO', 'phone' => '+221770000001'], $data['landlord']);
        $this->assertSame($this->agent->id, $data['agent']['id']);
        $this->assertArrayNotHasKey('phone', $data['agent']);
        $this->assertSame('+221770000001', $this->getJson('/api/leases?include=landlord')->json('data.0.landlord.phone'), 'la liste sert la même projection');

        $this->actingAsApi($this->owner);
        $this->assertSame('+221770000001', $this->getJson($url)->assertOk()->json('data.landlord.phone'));

        $this->actingAsApi($tenantUser);
        $asTenant = $this->getJson($url)->assertOk()->json('data');
        $this->assertSame('Aminata DIALLO', $asTenant['landlord']['full_name']);
        $this->assertArrayNotHasKey('phone', $asTenant['landlord']);

        $this->assertArrayNotHasKey('landlord', $this->getJson("/api/leases/{$lease->id}")->json('data'));
    }

    public function test_le_plafond_de_revision_est_servi_sur_la_fiche(): void
    {
        $lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'Bien'), 'Loc PLAFOND', ['rent_review_max_pct' => 4.5]);

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $this->assertEquals(4.5, $this->getJson("/api/leases/{$lease->id}")->assertOk()->json('data.rent_review_cap_pct'));
        $this->assertArrayNotHasKey('rent_review_cap_pct', $this->getJson('/api/leases')->json('data.0'), 'la fiche, pas la liste');
    }

    /** `Lease` porte `agent_id` : l'inclusion nomme l'agent, ou `null`. */
    public function test_sans_agent_l_inclusion_rend_null(): void
    {
        $lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'Bien'), 'Loc SEUL');
        Lease::query()->whereKey($lease->id)->update(['agent_id' => null]);

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $this->assertNull($this->getJson("/api/leases/{$lease->id}?include=agent")->assertOk()->json('data.agent'));
    }
}
