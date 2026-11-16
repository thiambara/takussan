<?php

namespace Tests\Feature\Owners;

use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;

/**
 * TCK-2910 — `sort=-last_payout_at` du carnet (« Filtres et tri », tri « Dernier versement ») : le
 * dernier reversement au bailleur VERSÉ dans l'agence, jamais trié côté client. Un reversement en
 * attente, à un locataire ou d'une autre agence ne compte pas ; un bailleur jamais payé passe en
 * dernier. Hors lecteur du relevé, le tri ne range que par id (il ne trahit pas les versements).
 */
class OwnerLastPayoutSortTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-09-20 10:00:00');
    }

    /** @return list<int> */
    private function ids(string $sort): array
    {
        return collect($this->getJson('/api/owners?per_page=100&sort='.$sort)->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_le_tri_par_dernier_versement(): void
    {
        $agency = $this->moneyAgency();
        $old = $this->landlordOf($agency);
        $recent = $this->landlordOf($agency);
        $never = $this->landlordOf($agency);
        $payout = fn (User $landlord, array $a) => Payout::factory()->create($a + ['agency_id' => $agency->id, 'landlord_id' => $landlord->id, 'payee_role' => PayeeRole::Landlord, 'status' => PayoutStatus::Completed]);
        $payout($old, ['processed_at' => '2026-08-05 09:00:00']);
        $payout($recent, ['processed_at' => '2026-09-05 09:00:00']);
        // Ne comptent pas : en attente, à un locataire, dans une autre agence.
        $payout($old, ['status' => PayoutStatus::Pending, 'processed_at' => '2026-09-18 09:00:00']);
        $payout($old, ['payee_role' => PayeeRole::Tenant, 'processed_at' => '2026-09-19 09:00:00']);
        Payout::factory()->create(['agency_id' => $this->moneyAgency()->id, 'landlord_id' => $old->id, 'payee_role' => PayeeRole::Landlord, 'status' => PayoutStatus::Completed, 'processed_at' => '2026-09-19 09:00:00']);

        $profile = fn (User $u) => OwnerProfile::query()->where('user_id', $u->id)->where('agency_id', $agency->id)->value('id');

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        // Les seuls trois bailleurs du test (les fabriques de reversement en posent d'autres).
        $mine = [$profile($old), $profile($recent), $profile($never)];
        $only = fn (array $ids) => array_values(array_intersect($ids, $mine));
        $this->assertSame([$profile($recent), $profile($old), $profile($never)], $only($this->ids('-last_payout_at')));
        $this->assertSame([$profile($old), $profile($recent), $profile($never)], $only($this->ids('last_payout_at')));
    }

    public function test_sans_payouts_create_le_tri_ne_range_que_par_id(): void
    {
        $agency = $this->moneyAgency();
        $first = $this->landlordOf($agency);
        $second = $this->landlordOf($agency);
        Payout::factory()->create(['agency_id' => $agency->id, 'landlord_id' => $first->id, 'payee_role' => PayeeRole::Landlord, 'status' => PayoutStatus::Completed, 'processed_at' => '2026-08-01 09:00:00']);
        Payout::factory()->create(['agency_id' => $agency->id, 'landlord_id' => $second->id, 'payee_role' => PayeeRole::Landlord, 'status' => PayoutStatus::Completed, 'processed_at' => '2026-09-01 09:00:00']);

        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PaymentsRecord, Capability::CrmViewAll])
            ->create(['agency_id' => $agency->id]);
        $agent = User::factory()->withTwoFactor()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'agency_role_id' => $role->id]);
        $agent = $agent->fresh();
        $this->assertFalse($agent->canActAt(Capability::PayoutsCreate, $agency));
        Sanctum::actingAs($agent);

        $parId = OwnerProfile::query()->where('agency_id', $agency->id)->orderBy('id')->pluck('id')->all();
        $this->assertSame($parId, $this->ids('-last_payout_at'));
        $this->assertSame($parId, $this->ids('last_payout_at'));
    }
}
