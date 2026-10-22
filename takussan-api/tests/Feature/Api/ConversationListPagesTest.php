<?php

namespace Tests\Feature\Api;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1387 (P135.02) — la messagerie ne lisait que la première page de la liste (30 fils), et la
 * pastille additionnait les `unread_count` de cette seule page : un non-lu d'un fil plus ancien ne
 * comptait pas. L'API rend désormais `meta.unread_total`, compté sur TOUTE la liste du lecteur,
 * hors fils en sourdine (la règle que la pastille appliquait déjà, `useUnreadCount`).
 */
class ConversationListPagesTest extends TestCase
{
    use RefreshDatabase;

    private User $moi;

    private User $autre;

    protected function setUp(): void
    {
        parent::setUp();
        $this->moi = User::factory()->create();
        $this->autre = User::factory()->create();
    }

    /**
     * Le fil et son message sont créés à leur date (`travelTo`) : `MessageObserver` pose
     * `last_message_at` à l'horloge, et un `forceFill` après coup lui échapperait.
     */
    private function fil(string $quand, ?string $message = null, MessageType $type = MessageType::Text): Conversation
    {
        $this->travelTo(now()->parse($quand));
        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil '.$quand,
            'created_by' => $this->autre->id,
            'last_message_at' => $quand,
        ]);
        $conversation->participants()->attach($this->moi->id, ['joined_at' => $quand, 'last_read_at' => $quand]);
        $conversation->participants()->attach($this->autre->id, ['joined_at' => $quand]);

        if ($message !== null) {
            $this->travel(1)->minutes();
            Message::query()->create([
                'conversation_id' => $conversation->id,
                'sender_id' => $this->autre->id,
                'content' => $message,
                'type' => $type->value,
            ]);
        }
        $this->travelBack();

        return $conversation;
    }

    public function test_le_total_des_non_lus_couvre_les_fils_hors_de_la_premiere_page(): void
    {
        // Le plus ancien des 35 fils porte le seul message non lu : il est en page 2.
        $ancien = $this->fil('2026-01-01 08:00:00', 'Toujours disponible ?');
        for ($i = 1; $i < 35; $i++) {
            $this->fil(now()->parse('2026-02-01 08:00:00')->addHours($i)->toDateTimeString());
        }

        Sanctum::actingAs($this->moi);
        $page1 = $this->getJson('/api/conversations?page=1&per_page=30')->assertOk();

        $this->assertSame(35, $page1->json('meta.total'));
        $this->assertNotContains($ancien->id, $page1->json('data.*.id'));
        $this->assertSame(0, array_sum($page1->json('data.*.unread_count')));
        $this->assertSame(1, $page1->json('meta.unread_total'));

        $page2 = $this->getJson('/api/conversations?page=2&per_page=30')->assertOk();
        $this->assertContains($ancien->id, $page2->json('data.*.id'));
        $this->assertSame(1, $page2->json('meta.unread_total'));
    }

    public function test_le_total_ignore_les_fils_en_sourdine_et_les_avis_systeme(): void
    {
        $sourdine = $this->fil('2026-03-01 08:00:00', 'Muet');
        $sourdine->participants()->updateExistingPivot($this->moi->id, ['is_muted' => true]);
        $this->fil('2026-03-02 08:00:00', 'Compté');
        $this->fil('2026-03-03 08:00:00', 'Membre ajouté', MessageType::System);

        Sanctum::actingAs($this->moi);
        $reponse = $this->getJson('/api/conversations')->assertOk();

        // La ligne garde son propre compte, sourdine comprise : seul le total l'écarte.
        $this->assertSame(2, array_sum($reponse->json('data.*.unread_count')));
        $this->assertSame(1, $reponse->json('meta.unread_total'));
    }
}
