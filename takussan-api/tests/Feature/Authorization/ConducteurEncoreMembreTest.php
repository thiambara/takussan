<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Policies\InventoryPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P218.04 (TCK-2198) — l'état des lieux et son conducteur, même règle d'auteur que P218.03
 * (décision du porteur du 2026-10-24) : `update` garde `landlordWrites` et exige en plus une
 * agence nulle ou `isMemberAt` ; `view` et la liste : le conducteur, si l'agence est nulle, s'il
 * en est encore membre, ou s'il y a un profil de bailleur de tout statut.
 *
 * Avant : le conducteur suspendu ou retiré lisait, listait et modifiait l'état des lieux.
 */
class ConducteurEncoreMembreTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
    }

    private function etatDesLieuxConduitPar(User $conducteur, ?int $agencyId): Inventory
    {
        return Inventory::factory()->create([
            'conducted_by' => $conducteur->id,
            'property_id' => Property::factory()->create(['agency_id' => $agencyId])->id,
        ]);
    }

    /** @return list<string> */
    private function idsListes(User $user): array
    {
        return collect($this->actingAsApi($user)->getJson('/api/inventories')->assertOk()->json('data'))
            ->pluck('id')->map(fn ($v) => (string) $v)->all();
    }

    private function assertPlusRien(User $conducteur, Inventory $inventory): void
    {
        $this->actingAsApi($conducteur)->getJson("/api/inventories/{$inventory->id}")->assertForbidden();
        $this->assertNotContains((string) $inventory->id, $this->idsListes($conducteur));
        $this->assertFalse((new InventoryPolicy)->update($conducteur, $inventory->fresh()));
    }

    public function test_le_conducteur_suspendu_ne_lit_ne_liste_ni_ne_modifie_plus(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $inventory = $this->etatDesLieuxConduitPar($agent, $this->agency->id);
        AgentProfile::query()->where('user_id', $agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->assertPlusRien($agent->fresh(), $inventory);
    }

    public function test_le_conducteur_retire_ne_lit_ne_liste_ni_ne_modifie_plus(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $inventory = $this->etatDesLieuxConduitPar($agent, $this->agency->id);
        AgentProfile::query()->where('user_id', $agent->id)->delete();

        $this->assertPlusRien($agent->fresh(), $inventory);
    }

    public function test_temoin_le_conducteur_actif_garde_tout(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $inventory = $this->etatDesLieuxConduitPar($agent, $this->agency->id);

        $this->actingAsApi($agent)->getJson("/api/inventories/{$inventory->id}")->assertOk();
        $this->assertContains((string) $inventory->id, $this->idsListes($agent));
        $this->assertTrue((new InventoryPolicy)->update($agent, $inventory));
    }

    public function test_temoin_le_bailleur_bloque_qui_l_a_conduit_le_lit_sans_le_modifier(): void
    {
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
            'status' => OwnerProfileStatus::Blocked->value,
        ]);
        $inventory = $this->etatDesLieuxConduitPar($bailleur, $this->agency->id);

        $this->actingAsApi($bailleur)->getJson("/api/inventories/{$inventory->id}")->assertOk();
        $this->assertContains((string) $inventory->id, $this->idsListes($bailleur));
        $this->assertFalse((new InventoryPolicy)->update($bailleur, $inventory));
    }

    public function test_temoin_un_bien_sans_agence_reste_a_son_conducteur(): void
    {
        $conducteur = User::factory()->create();
        $inventory = $this->etatDesLieuxConduitPar($conducteur, null);

        $this->actingAsApi($conducteur)->getJson("/api/inventories/{$inventory->id}")->assertOk();
        $this->assertContains((string) $inventory->id, $this->idsListes($conducteur));
        $this->assertTrue((new InventoryPolicy)->update($conducteur, $inventory));
    }
}
