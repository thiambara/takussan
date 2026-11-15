<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2906 (AC4) — `agent.phone` (l'agent responsable du bail, `include=agent`) au seul personnel de
 * l'agence du bail : ni au locataire, ni au bailleur.
 */
class LeaseAgentPhoneVisibilityTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $owner;

    private User $tenantUser;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');
        $this->agency = $this->agence();
        $this->agent = $this->agencyAgent($this->agency);
        $this->agent->forceFill(['phone' => '+221771234567'])->save();
        $this->owner = $this->bailleur($this->agency);
        $this->lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'Villa Ngor'), 'Awa Ndiaye', ['agent_id' => $this->agent->id]);
        $this->tenantUser = User::factory()->create();
        $this->lease->tenant->update(['user_id' => $this->tenantUser->id]);
    }

    /** @return array<string, mixed> */
    private function agentLuPar(User $as): array
    {
        return $this->actingAsApi($as)->getJson("/api/leases/{$this->lease->id}?include=agent")->assertOk()->json('data.agent');
    }

    public function test_ac4_le_personnel_de_l_agence_lit_le_telephone_de_l_agent(): void
    {
        $this->assertSame('+221771234567', $this->agentLuPar($this->agencyAdmin($this->agency))['phone']);
        $this->assertSame('+221771234567', $this->agentLuPar($this->agent)['phone']);
    }

    public function test_ac4_ni_le_locataire_ni_le_bailleur_ne_le_lisent(): void
    {
        $locataire = $this->agentLuPar($this->tenantUser);
        $this->assertSame($this->agent->id, $locataire['id']);
        $this->assertArrayNotHasKey('phone', $locataire);

        $this->assertArrayNotHasKey('phone', $this->agentLuPar($this->owner));
    }
}
