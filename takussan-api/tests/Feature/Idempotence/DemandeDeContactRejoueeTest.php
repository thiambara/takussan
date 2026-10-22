<?php

namespace Tests\Feature\Idempotence;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1410 (P144.08, ADR-0072 lot 3) — le contact anonyme, d'un bien comme d'un agent, rejoué sous
 * la même clé ne crée qu'une demande. Mesuré avant correctif : 201, 201, deux demandes.
 */
class DemandeDeContactRejoueeTest extends TestCase
{
    use RefreshDatabase;

    private const CORPS = [
        'name' => 'Awa Diop',
        'phone' => '+221771234567',
        'message' => 'Bonjour, ce bien est-il encore disponible ?',
    ];

    public function test_le_contact_d_un_bien_rejoue_sous_la_meme_cle_ne_cree_qu_une_demande(): void
    {
        $property = Property::factory()->published()->create(['user_id' => User::factory()->create()->id]);

        $this->rejouer("/api/public/properties/{$property->slug}/contact-lead", 'b1c2d3e4-f5a6-4b7c-8d9e-lead00000001');
    }

    public function test_le_contact_d_un_agent_rejoue_sous_la_meme_cle_ne_cree_qu_une_demande(): void
    {
        $agent = User::factory()->create(['username' => 'awa-diop']);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => Agency::factory()->create()->id]);

        $this->rejouer('/api/public/agents/awa-diop/contact-lead', 'b1c2d3e4-f5a6-4b7c-8d9e-lead00000002');
    }

    private function rejouer(string $chemin, string $cle): void
    {
        $this->postJson($chemin, self::CORPS, ['Idempotency-Key' => $cle])->assertCreated();
        $this->travel(30)->seconds();
        $this->postJson($chemin, self::CORPS, ['Idempotency-Key' => $cle])->assertCreated();

        $this->assertSame(1, PropertyContactLead::query()->count());
    }
}
