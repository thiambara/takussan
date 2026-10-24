<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1996 (P174.03) — un agent de deux agences crée un bien sous l'indice de profil actif, et le
 * bien est rangé dans l'agence de ce profil.
 *
 * Le front pose désormais l'indice par défaut sur ses appels serveur (`apiRequest`, repli sur le
 * cookie `active_profile_id`). Ce test garde le contrat que ce repli suppose côté API : sans
 * indice, la création est refusée (aucune auto-bascule pour deux agences) ; avec l'indice de A,
 * elle rend 201 et range le bien dans A, jamais dans B.
 */
class CreationParUnAgentDeDeuxAgencesTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private Agency $a;

    private Agency $b;

    private AgentProfile $profilA;

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = Agency::factory()->create(['moderation_required' => false]);
        $this->b = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = User::factory()->create();
        $this->profilA = AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->a->id]);
        AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->b->id]);
        Sanctum::actingAs($this->agent);
    }

    /** @return array<string, mixed> */
    private function bien(): array
    {
        return [
            'title' => 'Appartement F3 aux Almadies',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
        ];
    }

    public function test_sans_indice_la_creation_est_refusee(): void
    {
        $this->postJson('/api/properties', $this->bien())->assertForbidden();

        $this->assertSame(0, Property::query()->count());
    }

    public function test_avec_l_indice_le_bien_est_range_dans_l_agence_du_profil(): void
    {
        $id = $this->withHeaders(['X-Active-Profile-Hint' => "agent:{$this->profilA->id}"])
            ->postJson('/api/properties', $this->bien())
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($this->a->id, Property::query()->findOrFail($id)->agency_id);
    }
}
