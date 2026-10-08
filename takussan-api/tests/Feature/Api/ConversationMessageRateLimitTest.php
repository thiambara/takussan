<?php

namespace Tests\Feature\Api;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-592 (verif-592, mineur 9) — `POST /api/conversations/{id}/messages` est borné par un limiteur
 * nommé, par utilisateur : 30 par minute. Il n'en avait aucun, et une note vocale pèse jusqu'à 2 Mo.
 */
class ConversationMessageRateLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_is_throttled_after_thirty_messages_a_minute_and_others_are_not(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $conversation = Conversation::factory()->create();
        $conversation->participants()->attach([$a->id, $b->id]);

        Sanctum::actingAs($a);
        for ($i = 1; $i <= 30; $i++) {
            $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => "message {$i}"])->assertCreated();
        }
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'un de trop'])->assertStatus(429);

        // Le seau est celui de l'utilisateur : l'autre participant poste encore.
        Sanctum::actingAs($b);
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'moi aussi'])->assertCreated();
    }
}
