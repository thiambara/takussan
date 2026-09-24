<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConversationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-565, réparation 2 — une conversation directe n'ouvre plus sur un inconnu : elle exige
     * un contact JOIGNABLE (`MessagingReach`). Deux agents d'une même agence le sont.
     */
    private function mettreEnContact(User $a, User $b): Agency
    {
        $agency = Agency::factory()->create();
        $this->materializeRoleProfile($a, 'agent', $agency);
        $this->materializeRoleProfile($b, 'agent', $agency);

        return $agency;
    }

    public function test_create_conversation_and_send_message(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $this->mettreEnContact($me, $other);

        Sanctum::actingAs($me);

        $response = $this->postJson('/api/conversations', [
            'subject' => 'À propos de la villa',
            'participants' => [$other->id],
            'initial_message' => 'Bonjour, est-ce toujours disponible ?',
        ])->assertCreated();

        $conversationId = $response->json('data.id');

        $this->postJson("/api/conversations/{$conversationId}/messages", [
            'content' => 'Oui bien sûr, quand voulez-vous visiter ?',
        ])->assertCreated()
            ->assertJsonPath('data.content', 'Oui bien sûr, quand voulez-vous visiter ?');

        $this->getJson("/api/conversations/{$conversationId}/messages")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.has_more', false);
    }

    public function test_non_participant_cannot_send_message(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $this->mettreEnContact($me, $other);
        $outsider = User::factory()->create();

        Sanctum::actingAs($me);
        $conversationId = $this->postJson('/api/conversations', [
            'participants' => [$other->id],
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($outsider);
        $this->postJson("/api/conversations/{$conversationId}/messages", ['content' => 'hi'])
            ->assertForbidden();
    }

    public function test_conversation_list_includes_attached_property_for_subject_fallback(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $agency = $this->mettreEnContact($me, $other);
        $property = Property::factory()->create(['title' => 'Villa Almadies', 'agency_id' => $agency->id]);

        Sanctum::actingAs($me);
        $this->postJson('/api/conversations', [
            'subject' => null,
            'property_id' => $property->id,
            'participants' => [$other->id],
            'initial_message' => 'Bonjour',
        ])->assertCreated()
            ->assertJsonPath('data.subject', null)
            ->assertJsonPath('data.property.id', $property->id)
            ->assertJsonPath('data.property.title', 'Villa Almadies');

        $this->getJson('/api/conversations')
            ->assertOk()
            ->assertJsonPath('data.0.subject', null)
            ->assertJsonPath('data.0.property.id', $property->id)
            ->assertJsonPath('data.0.property.title', 'Villa Almadies');
    }

    public function test_conversation_list_omits_property_when_not_attached(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $this->mettreEnContact($me, $other);

        Sanctum::actingAs($me);
        $this->postJson('/api/conversations', [
            'subject' => 'Sans propriété',
            'participants' => [$other->id],
            'initial_message' => 'Bonjour',
        ])->assertCreated();

        $this->getJson('/api/conversations')
            ->assertOk()
            // BelongsTo with null FK + whenLoaded → property serialized as null.
            ->assertJsonPath('data.0.property', null);
    }

    // ---------------------------------------------------------------------------------------------
    // TCK-565, réparation 2 — la conversation DIRECTE applique le périmètre du groupe.
    //
    // Relevé du vérificateur (2026-09-23) : `POST /api/conversations` sans `type` acceptait N
    // inconnus (201), qui devenaient des correspondants ; le sélecteur les listait par nom, et le
    // groupe refusé une requête plus tôt passait. Ces tests tiennent chacune des trois gardes.
    // ---------------------------------------------------------------------------------------------

    public function test_une_directe_vers_un_inconnu_est_refusee(): void
    {
        $me = User::factory()->create();
        $inconnu = User::factory()->create();

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'participants' => [$inconnu->id],
            'initial_message' => 'Bonjour',
        ], ['Accept-Language' => 'fr'])->assertUnprocessable();

        $this->assertSame(['participants'], array_keys($resp->json('errors')));
        $this->assertSame(__('messaging.errors.participants_out_of_reach', [], 'fr'), $resp->json('message'));
        $this->assertSame(0, Conversation::query()->count());
    }

    /** La sonde même du vérificateur : le détour par une directe ne rend personne joignable. */
    public function test_le_detour_par_une_directe_ne_rend_pas_un_inconnu_joignable(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create(['first_name' => 'Inconnu', 'last_name' => 'Un']);
        $b = User::factory()->create(['first_name' => 'Inconnu', 'last_name' => 'Deux']);

        Sanctum::actingAs($me);

        $groupe = ['type' => 'group', 'subject' => 'x', 'participants' => [$a->id, $b->id]];
        $this->postJson('/api/conversations', $groupe)->assertUnprocessable();

        foreach ([[$a->id, $b->id], [$a->id], [$b->id]] as $participants) {
            $this->postJson('/api/conversations', ['participants' => $participants])->assertUnprocessable();
        }

        $this->getJson('/api/conversations/contacts')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/conversations', $groupe)->assertUnprocessable();
        $this->assertSame(0, Conversation::query()->count());
    }

    /**
     * Passe finale (vérificateur, passe 3) — « directe » veut dire **tout `type` autre que
     * `group`**, et pas seulement un corps sans `type`. Les tests ci-dessus n'envoyaient jamais de
     * `type` : traiter `support` comme un groupe dans `StoreConversationRequest::isGroup()` laissait
     * 60 tests verts, et rouvrait exactement le détour de la réparation 2 — N inconnus acceptés
     * (201), devenus aussitôt « joignables » par la règle 1 de `MessagingReach`.
     *
     * Les types sont lus sur l'enum, pas recopiés : un type ajouté demain est couvert d'office.
     */
    public function test_la_garde_de_la_directe_vaut_pour_tout_type_autre_que_groupe(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create(['first_name' => 'Inconnu', 'last_name' => 'Un']);
        $b = User::factory()->create(['first_name' => 'Inconnu', 'last_name' => 'Deux']);
        $collegue = User::factory()->create();
        $this->mettreEnContact($me, $collegue);
        $ailleurs = Agency::factory()->create();
        $bienAilleurs = Property::factory()->create(['agency_id' => $ailleurs->id]);

        Sanctum::actingAs($me);

        $types = collect(ConversationType::cases())
            ->reject(fn (ConversationType $t) => $t === ConversationType::Group)
            ->map(fn (ConversationType $t) => $t->value)
            ->values();
        $this->assertContains(ConversationType::Support->value, $types->all());

        foreach ($types as $type) {
            // Deux inconnus : ce n'est pas une directe.
            $this->postJson('/api/conversations', ['type' => $type, 'participants' => [$a->id, $b->id]])
                ->assertUnprocessable()->assertJsonValidationErrors(['participants']);
            // Un inconnu : hors d'atteinte.
            $this->postJson('/api/conversations', ['type' => $type, 'participants' => [$a->id]])
                ->assertUnprocessable()->assertJsonValidationErrors(['participants']);
            // Un contact joignable, mais rattaché au bien d'une autre agence.
            $this->postJson('/api/conversations', [
                'type' => $type,
                'participants' => [$collegue->id],
                'property_id' => $bienAilleurs->id,
            ])->assertUnprocessable()->assertJsonValidationErrors(['property_id']);
        }

        $this->assertSame(0, Conversation::query()->count(), 'aucune conversation ouverte par ce détour');
        $contacts = $this->getJson('/api/conversations/contacts')->assertOk()->json('data');
        $this->assertSame([$collegue->id], collect($contacts)->pluck('id')->map(fn ($id) => (int) $id)->all());

        // Témoin : le même type, vers le contact joignable et sans rattachement étranger, passe —
        // les 422 ci-dessus viennent donc de la garde, pas d'un type refusé en bloc.
        foreach ($types as $type) {
            $this->postJson('/api/conversations', ['type' => $type, 'participants' => [$collegue->id]])
                ->assertCreated()->assertJsonPath('data.type', $type);
        }
    }

    /** Une directe relie DEUX personnes : au-delà, c'est un groupe, et il a son propre chemin. */
    public function test_une_directe_relie_exactement_deux_personnes(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();
        $agency = Agency::factory()->create();
        foreach ([$me, $a, $b] as $agent) {
            $this->materializeRoleProfile($agent, 'agent', $agency);
        }

        Sanctum::actingAs($me);

        // Trois personnes joignables, mais trois : refusé, avec une phrase qui dit quoi faire.
        // Et soi-même seul : refusé aussi — c'était un `abort` en anglais, sans clé d'erreur.
        foreach ([[$a->id, $b->id], [$me->id]] as $participants) {
            $resp = $this->postJson('/api/conversations', ['participants' => $participants], ['Accept-Language' => 'fr'])
                ->assertUnprocessable();

            $this->assertSame(['participants'], array_keys($resp->json('errors')), json_encode($participants));
            $this->assertSame(__('messaging.errors.direct_single_participant', [], 'fr'), $resp->json('message'));
        }
        $this->assertSame(0, Conversation::query()->count());

        // L'acteur répété dans la liste ne compte pas : c'est bien une directe à deux.
        $this->postJson('/api/conversations', ['participants' => [$me->id, $a->id]])
            ->assertCreated()
            ->assertJsonPath('data.type', 'direct');
    }

    public function test_une_directe_ne_se_rattache_pas_au_bien_ou_au_bail_d_une_autre_agence(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $this->mettreEnContact($me, $other);
        $ailleurs = Agency::factory()->create();
        $bienAilleurs = Property::factory()->create(['agency_id' => $ailleurs->id]);
        $bailAilleurs = Lease::factory()->create(['property_id' => $bienAilleurs->id, 'agency_id' => $ailleurs->id]);

        Sanctum::actingAs($me);

        foreach (['property_id' => $bienAilleurs->id, 'lease_id' => $bailAilleurs->id] as $champ => $id) {
            $resp = $this->postJson('/api/conversations', [
                'participants' => [$other->id],
                $champ => $id,
            ], ['Accept-Language' => 'fr'])->assertUnprocessable();

            $this->assertSame([$champ], array_keys($resp->json('errors')));
            $this->assertSame(__('messaging.errors.conversation_context_forbidden', [], 'fr'), $resp->json("errors.{$champ}.0"));
        }

        $this->assertSame(0, Conversation::query()->count());
    }

    public function test_une_directe_se_rattache_a_son_propre_bail(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $this->mettreEnContact($me, $other);
        $bail = Lease::factory()->create(['landlord_id' => $me->id]);

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'participants' => [$other->id],
            'lease_id' => $bail->id,
        ])->assertCreated();
    }
}
