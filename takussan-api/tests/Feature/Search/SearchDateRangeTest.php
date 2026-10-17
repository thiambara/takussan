<?php

namespace Tests\Feature\Search;

use App\Models\Conversation;
use App\Models\Document;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\DocumentType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-786 (P16.05) — `filter[date_from]` / `filter[date_to]` de `/api/search/documents` et
 * `/api/search/messages` filtrent DANS Meilisearch, avant sa pagination.
 *
 * Avant, la plage passait par `$search->query(...)`, donc en SQL sur une page déjà découpée par
 * le moteur : trois correspondances récentes hors plage occupaient les pages 1 à 3, la page 1
 * revenait vide, et `total` (recompté en SQL) disait 1.
 *
 * Sur Meilisearch réel : le pilote `collection` rejouerait la clause en SQL, où `created_at`
 * est une colonne `timestamp` et non l'entier de l'index.
 */
class SearchDateRangeTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_documents_la_correspondance_de_la_plage_est_en_premiere_page(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        $dansLaPlage = $this->document($user, $property, now()->subDays(30));
        foreach (range(1, 3) as $_) {
            $this->document($user, $property, now()->subDays(2));
        }
        $this->waitForMeilisearch();

        $response = $this->actingAs($user)->getJson('/api/search/documents?q=daterange&sort=-created_at&per_page=1'
            .'&filter[date_from]='.now()->subDays(40)->toDateString()
            .'&filter[date_to]='.now()->subDays(20)->toDateString());

        $response->assertOk();
        $this->assertSame([$dansLaPlage->id], array_column($response->json('data'), 'id'));
        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_messages_la_correspondance_de_la_plage_est_en_premiere_page(): void
    {
        $user = User::factory()->create();
        $conversation = $this->conversation($user);

        $dansLaPlage = $this->message($user, $conversation, now()->subDays(30));
        foreach (range(1, 3) as $_) {
            $this->message($user, $conversation, now()->subDays(2));
        }
        $this->waitForMeilisearch();

        $response = $this->actingAs($user)->getJson('/api/search/messages?q=daterange&sort=-created_at&per_page=1'
            .'&filter[date_from]='.now()->subDays(40)->toDateString()
            .'&filter[date_to]='.now()->subDays(20)->toDateString());

        $response->assertOk();
        $this->assertSame([$dansLaPlage->id], array_column($response->json('data'), 'id'));
        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_les_bornes_sont_inclusives_au_jour(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);
        $jour = now()->subDays(10)->startOfDay();

        $premier = $this->document($user, $property, $jour->copy()->setTime(0, 0, 0));
        $dernier = $this->document($user, $property, $jour->copy()->setTime(23, 59, 59));
        $this->document($user, $property, $jour->copy()->subSecond());
        $this->document($user, $property, $jour->copy()->addDay());
        $this->waitForMeilisearch();

        $response = $this->actingAs($user)->getJson('/api/search/documents?q=daterange&sort=-created_at'
            .'&filter[date_from]='.$jour->toDateString()
            .'&filter[date_to]='.$jour->toDateString());

        $response->assertOk();
        $this->assertSame([$dernier->id, $premier->id], array_column($response->json('data'), 'id'));
        $this->assertSame(2, $response->json('meta.total'));
    }

    private function document(User $user, Property $property, Carbon $createdAt): Document
    {
        return Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'daterange plage test',
            'type' => DocumentType::Other,
            'created_at' => $createdAt,
        ]);
    }

    private function conversation(User $user): Conversation
    {
        $conversation = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Test',
            'created_by' => $user->id,
        ]);

        $conversation->participants()->attach($user->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now(),
        ]);

        return $conversation;
    }

    private function message(User $user, Conversation $conversation, Carbon $createdAt): Message
    {
        return Message::factory()->create([
            'conversation_id' => $conversation->id,
            'sender_id' => $user->id,
            'content' => 'daterange plage test',
            'created_at' => $createdAt,
        ]);
    }
}
