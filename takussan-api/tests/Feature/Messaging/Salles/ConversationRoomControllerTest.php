<?php

namespace Tests\Feature\Messaging\Salles;

use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Support\ScenesDeSalles;

/**
 * TCK-2960 — `POST /api/conversations/rooms` : 201 quand l'appel crée la salle, 200 ensuite ; 403 pour qui
 * ne lit pas l'objet, ou le lit sans en être partie ; 422 pour un type sans salle.
 */
class ConversationRoomControllerTest extends ApiTestCase
{
    use RefreshDatabase, ScenesDeSalles;

    public function test_201_a_la_creation_puis_200(): void
    {
        ['lease' => $lease, 'tenant' => $tenant] = $this->sceneDuBail();
        // Un bail d'avant les salles : sa salle n'existe pas encore.
        DB::table('conversation_participants')->where('conversation_id', $this->salleDe($lease)->id)->delete();
        DB::table('conversations')->where('id', $this->salleDe($lease)->id)->delete();
        $this->assertNull($this->salleDe($lease));

        $this->actingAsApi($tenant);
        $id = $this->apiPost('/api/conversations/rooms', ['subject_type' => 'lease', 'subject_id' => $lease->id])
            ->assertCreated()
            ->assertJsonPath('data.type', 'lease')
            ->assertJsonPath('data.subject_type', 'lease')
            ->assertJsonPath('data.subject_id', $lease->id)
            ->assertJsonPath('data.abilities.can_send_message', true)
            ->json('data.id');

        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'lease', 'subject_id' => $lease->id])
            ->assertOk()
            ->assertJsonPath('data.id', $id);
        $this->assertSame(1, Conversation::query()->where('type', 'lease')->where('subject_id', $lease->id)->count());
    }

    public function test_403_pour_qui_ne_lit_pas_l_objet(): void
    {
        ['lease' => $lease, 'booking' => $booking] = $this->sceneDuBail() + $this->sceneDeLaReservation();
        $this->actingAsApi(User::factory()->create());

        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'lease', 'subject_id' => $lease->id])->assertForbidden();
        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'booking', 'subject_id' => $booking->id])->assertForbidden();
    }

    public function test_403_pour_qui_lit_le_bail_sans_en_etre_partie(): void
    {
        ['lease' => $lease, 'agency' => $agency] = $this->sceneDuBail();
        $collegue = $this->agentDe($agency);
        $this->assertTrue($collegue->can('view', $lease));
        $this->actingAsApi($collegue);

        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'lease', 'subject_id' => $lease->id])->assertForbidden();
        $this->assertNotContains($collegue->id, $this->membresActifs($this->salleDe($lease)));
    }

    public function test_422_pour_un_type_sans_salle_ou_hors_registre(): void
    {
        ['tenant' => $tenant, 'lease' => $lease] = $this->sceneDuBail();
        $this->actingAsApi($tenant);

        foreach (['maintenance_request', 'lease_payment', 'property', Lease::class, ''] as $type) {
            $this->apiPost('/api/conversations/rooms', ['subject_type' => $type, 'subject_id' => $lease->id])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['subject_type']);
        }
        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'lease', 'subject_id' => 'abc'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['subject_id']);
    }

    /**
     * Pas d'oracle d'existence (règle de TCK-1070) : un objet absent ou supprimé reçoit la réponse de l'objet
     * d'un tiers, à l'octet près.
     */
    public function test_un_objet_absent_ou_supprime_recoit_le_refus_d_un_tiers(): void
    {
        ['tenant' => $tenant, 'lease' => $lease] = $this->sceneDuBail();
        ['lease' => $bailTiers] = $this->sceneDuBail();
        $this->actingAsApi($tenant);
        $verdict = fn (int $id) => [
            ($r = $this->apiPost('/api/conversations/rooms', ['subject_type' => 'lease', 'subject_id' => $id]))->status(),
            $r->json(),
        ];

        $tiers = $verdict($bailTiers->id);
        $this->assertSame(403, $tiers[0]);
        $this->assertSame($tiers, $verdict(999_999_999), 'absent');

        $lease->delete();
        $this->assertSame($tiers, $verdict($lease->id), 'supprimé');
    }

    public function test_un_inconnu_n_ouvre_pas_la_salle_d_un_bail_qui_n_en_a_pas(): void
    {
        ['lease' => $lease] = $this->sceneDuBail();
        $this->effacerLaSalle($lease);
        $this->actingAsApi(User::factory()->create());

        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'lease', 'subject_id' => $lease->id])->assertForbidden();
        $this->assertNull($this->salleDe($lease), 'aucune salle créée pour qui ne lit pas le bail');
    }

    private function effacerLaSalle(Lease $lease): void
    {
        DB::table('conversation_participants')->where('conversation_id', $this->salleDe($lease)->id)->delete();
        DB::table('conversations')->where('id', $this->salleDe($lease)->id)->delete();
    }

    public function test_le_locataire_sans_compte_n_empeche_pas_l_ouverture_par_le_bailleur(): void
    {
        ['lease' => $lease, 'landlord' => $landlord] = $this->sceneDuBail(['tenant_id' => Customer::factory()->create()->id, 'agent_id' => null]);
        $this->actingAsApi($landlord);

        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'lease', 'subject_id' => $lease->id])
            ->assertOk()
            ->assertJsonCount(1, 'data.participants');
        $this->assertSame([$landlord->id], $this->membresActifs($this->salleDe($lease)));
    }
}
