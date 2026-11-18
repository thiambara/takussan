<?php

namespace Tests\Feature\Messaging\Salles;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Support\ScenesDeSalles;

/**
 * TCK-2960 (AC7) — une salle ne s'administre pas à la main : ses membres sont ceux de l'objet. Ajouter,
 * retirer, renommer, quitter : refusé (`ConversationPolicy` ne l'admet que pour un `group`), et
 * `POST /api/conversations` n'en crée pas (`StoreConversationRequest` n'admet que `direct` et `group`).
 */
class SalleNonAdministrableTest extends ApiTestCase
{
    use RefreshDatabase, ScenesDeSalles;

    /** @return list<array{Conversation, User, User}> la salle, un membre qui agit, un autre membre */
    private function salles(): array
    {
        ['lease' => $lease, 'agent' => $agent, 'tenant' => $tenant] = $this->sceneDuBail();
        ['booking' => $booking, 'owner' => $owner, 'candidat' => $candidat] = $this->sceneDeLaReservation();

        return [
            [$this->salleDe($lease), $agent, $tenant],
            [$this->salleDe($booking), $owner, $candidat],
        ];
    }

    public function test_ajout_retrait_renommage_et_depart_sont_refuses(): void
    {
        foreach ($this->salles() as [$salle, $membre, $autre]) {
            $tiers = User::factory()->create();
            $avant = $this->membresActifs($salle);
            $this->actingAsApi($membre);

            $ajout = $this->apiPost("/api/conversations/{$salle->id}/participants", ['user_ids' => [$tiers->id]]);
            $this->assertContains($ajout->status(), [403, 422], 'ajout refusé : '.$ajout->getContent());
            $this->apiDelete("/api/conversations/{$salle->id}/participants/{$autre->id}")->assertForbidden();
            $this->apiDelete("/api/conversations/{$salle->id}/participants/{$membre->id}")->assertForbidden();
            $this->apiPatch("/api/conversations/{$salle->id}", ['subject' => 'Renommée'])->assertForbidden();

            $this->assertSame($avant, $this->membresActifs($salle), 'les membres n\'ont pas bougé');
            $this->assertNull($salle->fresh()->subject);
        }
    }

    public function test_l_ajout_d_une_personne_joignable_est_refuse_en_403_dans_les_deux_salles(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'agent' => $agent] = $this->sceneDuBail();
        ['booking' => $booking, 'agency' => $agenceResa, 'property' => $bien] = $this->sceneDeLaReservation();
        // Le contact de la réservation devient un agent de l'agence : un collègue lui est joignable.
        $contact = $this->agentDe($agenceResa);
        $this->confierLeBienA($bien, $contact);
        $this->actingAsApi($contact);
        $this->apiPost('/api/conversations/rooms', ['subject_type' => 'booking', 'subject_id' => $booking->id])->assertOk();

        foreach ([
            [$this->salleDe($lease), $agent, $this->agentDe($agency)],
            [$this->salleDe($booking), $contact, $this->agentDe($agenceResa)],
        ] as [$salle, $membre, $collegue]) {
            $this->actingAsApi($membre);
            $this->apiPost("/api/conversations/{$salle->id}/participants", ['user_ids' => [$collegue->id]])->assertForbidden();
            $this->assertNotContains($collegue->id, $this->membresActifs($salle));
        }
    }

    public function test_post_conversations_ne_cree_ni_salle_de_bail_ni_salle_de_reservation(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'agent' => $agent] = $this->sceneDuBail();
        $collegue = $this->agentDe($agency);
        $this->actingAsApi($agent);
        $avant = Conversation::query()->count();

        foreach (['lease', 'booking'] as $type) {
            $this->apiPost('/api/conversations', [
                'type' => $type,
                'participants' => [$collegue->id],
                'subject' => 'Salle à la main',
                'lease_id' => $lease->id,
            ])->assertUnprocessable()->assertJsonValidationErrors(['type']);
        }

        $this->assertSame($avant, Conversation::query()->count());
    }
}
