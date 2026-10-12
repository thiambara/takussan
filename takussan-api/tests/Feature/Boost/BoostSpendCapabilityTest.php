<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\PropertyBoost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §5) — `boost.spend` : capacité d'agence, accordée à l'admin d'espace par
 * `agencyAssignable()`, PAS à l'agent système (un rôle personnalisé peut la lui donner).
 */
class BoostSpendCapabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_capacite_est_assignable_par_une_agence(): void
    {
        $this->assertSame('boost.spend', Capability::BoostSpend->value);
        $this->assertSame('boost', Capability::BoostSpend->domain());
        $this->assertContains(Capability::BoostSpend, Capability::agencyAssignable());
        $this->assertNotContains(Capability::BoostSpend, Capability::platformReserved());
    }

    public function test_l_admin_d_espace_peut_booster_et_lire_le_solde_l_agent_non(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);

        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $this->assertTrue($admin->canActAt(Capability::BoostSpend, $agency));
        $this->assertTrue(Gate::forUser($admin)->allows('viewAny', [CreditLot::class, $agency]));
        $this->assertTrue(Gate::forUser($admin)->allows('create', [PropertyBoost::class, $property]));

        $agent = $this->actingAsRole('agent', ['agency' => $agency]);
        $this->assertFalse($agent->canActAt(Capability::BoostSpend, $agency));
        $this->assertFalse(Gate::forUser($agent)->allows('viewAny', [CreditLot::class, $agency]));
        $this->assertFalse(Gate::forUser($agent)->allows('create', [PropertyBoost::class, $property]));
    }

    public function test_un_admin_d_un_autre_espace_ne_peut_rien(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $autre = $this->actingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);

        $this->assertFalse(Gate::forUser($autre)->allows('viewAny', [CreditLot::class, $agency]));
        $this->assertFalse(Gate::forUser($autre)->allows('create', [PropertyBoost::class, $property]));
    }
}
