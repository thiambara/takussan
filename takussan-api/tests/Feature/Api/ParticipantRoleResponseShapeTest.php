<?php

namespace Tests\Feature\Api;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-952 (P45.03) — la réponse de `PATCH api/conversations/{id}/participants/{user}` est celle
 * que le front type (`ApiResponse<Conversation>`), mesurée par exécution.
 *
 * `->toArray($request)` appelé à la main laissait passer les `MissingValue` de `whenHas` et
 * `whenLoaded` : `unread_count`, `last_message`, `property` et `participants` sortaient en `{}`.
 * Une relation non chargée doit être ABSENTE, jamais un objet vide qu'un `map()` ferait planter.
 */
class ParticipantRoleResponseShapeTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_reponse_ne_rend_ni_objet_vide_ni_cle_manquante_au_type(): void
    {
        $admin = User::factory()->create();
        $member = User::factory()->create();
        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Groupe',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($member->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        Sanctum::actingAs($admin);
        $response = $this->patchJson("/api/conversations/{$conversation->id}/participants/{$member->id}", [
            'role' => ParticipantRole::Admin->value,
        ])->assertOk();

        $data = json_decode($response->getContent())->data;
        foreach (get_object_vars($data) as $cle => $valeur) {
            $this->assertFalse(
                $valeur instanceof \stdClass && get_object_vars($valeur) === [],
                "data.{$cle} est un objet vide",
            );
        }

        foreach (['unread_count', 'last_message', 'property', 'participants'] as $nonCharge) {
            $response->assertJsonMissingPath("data.{$nonCharge}");
        }
        $this->assertIsString($response->json('data.updated_at'));
        $this->assertSame($conversation->id, $response->json('data.id'));
    }
}
