<?php

namespace Tests\Feature\Api;

use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P133.04 (TCK-1381) — le détail du bail rend la pénalité de retard et le délai de grâce. Le
 * renouvellement les reprend du bail d'origine (`LeaseRenewalService`), mais le détail ne les
 * rendait pas : le dialogue de renouvellement affichait « — → — » pour ce qui serait hérité.
 */
class LeaseLateFeeExposedTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_detail_du_bail_rend_la_penalite_de_retard_et_le_delai_de_grace(): void
    {
        Notification::fake();
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 7,
        ]);
        Sanctum::actingAs($landlord);

        $data = $this->getJson("/api/leases/{$lease->id}")->assertOk()->json('data');

        // JSON rend 5.0 en « 5 ».
        $this->assertEquals(5, $data['late_fee_percent']);
        $this->assertSame(7, $data['late_fee_grace_days']);
    }

    public function test_un_bail_sans_penalite_les_rend_a_null(): void
    {
        Notification::fake();
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'late_fee_percent' => null,
            'late_fee_grace_days' => null,
        ]);
        Sanctum::actingAs($landlord);

        $data = $this->getJson("/api/leases/{$lease->id}")->assertOk()->json('data');

        $this->assertArrayHasKey('late_fee_percent', $data);
        $this->assertNull($data['late_fee_percent']);
        $this->assertNull($data['late_fee_grace_days']);
    }
}
