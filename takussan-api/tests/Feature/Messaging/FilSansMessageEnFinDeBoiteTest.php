<?php

namespace Tests\Feature\Messaging;

use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2960 (ADR-0128 § 2) — un fil sans aucun message (une salle ouverte par `messaging:open-rooms`,
 * avant tout échange) se range APRÈS les fils qui ont parlé. `orderByDesc('last_message_at')` les
 * mettait en tête : PostgreSQL trie les NULL en premier sur un ordre décroissant, et chaque boîte se
 * serait ouverte sur ses salles muettes au premier déploiement.
 */
class FilSansMessageEnFinDeBoiteTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_fil_sans_message_vient_apres_un_fil_qui_a_parle(): void
    {
        $moi = User::factory()->create();
        $autre = User::factory()->create();

        $muet = $this->groupe($moi, $autre, null);
        $parle = $this->groupe($moi, $autre, now()->subDays(30));

        Sanctum::actingAs($moi);
        $ids = collect($this->getJson('/api/conversations')->assertOk()->json('data'))->pluck('id')->all();

        $this->assertSame([$parle->id, $muet->id], $ids);
    }

    private function groupe(User $moi, User $autre, mixed $dernierMessage): Conversation
    {
        $c = Conversation::create([
            'type' => ConversationType::Group->value,
            'created_by' => $moi->id,
            'title' => 'Groupe',
        ]);
        $c->forceFill(['last_message_at' => $dernierMessage])->saveQuietly();
        $c->participants()->attach([$moi->id => ['joined_at' => now()], $autre->id => ['joined_at' => now()]]);

        return $c;
    }
}
