<?php

namespace Tests\Feature\Search;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2958 (ADR-0128 § 3) — `messages:unindex-coded` retire de l'index Meilisearch RÉEL les avis
 * indexés avant TCK-2958 (leur phrase française), et ne touche pas aux messages écrits.
 *
 * L'état d'avant est reproduit tel que la migration le laisse : des documents indexés quand leur
 * ligne était indexable, dont la ligne est ensuite devenue `system`/`event` par SQL (sans
 * l'observateur de Scout). Le témoin : avant la commande, la recherche les rend encore.
 */
class MessagesUnindexCodedTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_les_avis_deja_indexes_sont_retires_et_les_messages_ecrits_restent(): void
    {
        $user = User::factory()->create();
        $fil = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Test',
            'created_by' => $user->id,
        ]);
        $ecrit = Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => $user->id, 'content' => 'desindex ecrit']);
        $avis = Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => $user->id, 'content' => 'desindex avis']);
        $evenement = Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => $user->id, 'content' => 'desindex intervention']);
        $supprime = Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => $user->id, 'content' => 'desindex supprime']);
        $this->waitForMeilisearch();

        DB::table('messages')->where('id', $avis->id)->update(['type' => 'system']);
        DB::table('messages')->where('id', $evenement->id)->update(['type' => 'event']);
        DB::table('messages')->where('id', $supprime->id)->update(['type' => 'system', 'deleted_at' => now()]);

        $trouves = fn () => collect(Message::search('desindex')->keys())->map(fn ($id) => (int) $id)->sort()->values()->all();
        $this->assertSame([$ecrit->id, $avis->id, $evenement->id, $supprime->id], $trouves(), 'témoin : les avis sont encore indexés');

        $this->artisan('messages:unindex-coded')->expectsOutputToContain('retired=3')->assertSuccessful();
        $this->waitForMeilisearch();
        $this->assertSame([$ecrit->id], $trouves());

        // Idempotente.
        $this->artisan('messages:unindex-coded')->assertSuccessful();
        $this->waitForMeilisearch();
        $this->assertSame([$ecrit->id], $trouves());
    }
}
