<?php

namespace Tests\Feature\Idempotence;

use App\Models\Message;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1408 (P144.07, ADR-0072 lot 3) — le premier message envoyé depuis la fiche d'un bien passe
 * par une action serveur du serveur Next, qui abandonne à 30 s (TCK-1215). Renvoyé sous la même
 * clé, il ne s'écrit qu'une fois.
 */
class MessageDeLaFicheRejoueTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_message_de_la_fiche_rejoue_sous_la_meme_cle_ne_s_ecrit_qu_une_fois(): void
    {
        $property = Property::factory()->published()->create(['user_id' => User::factory()->create()->id]);
        Sanctum::actingAs(User::factory()->create());
        $cle = ['Idempotency-Key' => 'a7b6c5d4-e3f2-4a1b-9c8d-fiche0000001'];

        $premier = $this->postJson("/api/public/properties/{$property->slug}/contact-message", ['message' => 'Ce bien est-il libre ?'], $cle)
            ->assertCreated();
        $this->travel(30)->seconds();
        $this->postJson("/api/public/properties/{$property->slug}/contact-message", ['message' => 'Ce bien est-il libre ?'], $cle)
            ->assertCreated()
            ->assertJsonPath('data.conversation_id', $premier->json('data.conversation_id'));

        $this->assertSame(1, Message::query()->where('content', 'Ce bien est-il libre ?')->count());
    }
}
