<?php

namespace Tests\Feature\Idempotence;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1398 (P144.02, ADR-0072 lot 1) — le scénario mesuré de l'angle 144 : deux `POST` identiques à
 * 30 s d'écart écrivaient deux messages. Sous la même `Idempotency-Key`, un seul.
 */
class MessageRejoueTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
    }

    public function test_un_message_rejoue_sous_la_meme_cle_ne_s_ecrit_qu_une_fois(): void
    {
        [$member, $conversation] = $this->conversation();
        Sanctum::actingAs($member);
        $cle = ['Idempotency-Key' => 'b6f1c9a2-7d3e-4f0a-9c1b-2e5d8f7a6c40'];

        $premier = $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Je passe demain'], $cle)
            ->assertCreated();
        $this->travel(30)->seconds();
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Je passe demain'], $cle)
            ->assertCreated()
            ->assertHeader('Idempotent-Replayed', 'true')
            ->assertJsonPath('data.id', $premier->json('data.id'));

        $this->assertSame(1, Message::query()->count());
    }

    public function test_une_note_vocale_rejouee_sous_la_meme_cle_ne_s_ecrit_qu_une_fois(): void
    {
        [$member, $conversation] = $this->conversation();
        Sanctum::actingAs($member);
        $en_tetes = ['Idempotency-Key' => 'c0a8f3e1-2b4d-4e6f-8a0c-1d3e5f7a9b2c', 'Accept' => 'application/json'];

        foreach ([1, 2] as $essai) {
            $this->post("/api/conversations/{$conversation->id}/messages", [
                'type' => 'audio',
                'duration' => 12,
                'audio' => UploadedFile::fake()->createWithContent('note.ogg', "OggS\x00\x02".str_repeat("\x00", 20).'OpusHead'.str_repeat("\x00", 64)),
            ], $en_tetes)->assertCreated();
        }

        $this->assertSame(1, Message::query()->count());
    }

    public function test_sans_cle_deux_envois_ecrivent_deux_messages_comme_avant(): void
    {
        [$member, $conversation] = $this->conversation();
        Sanctum::actingAs($member);

        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Je passe demain'])->assertCreated();
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Je passe demain'])->assertCreated();

        $this->assertSame(2, Message::query()->count());
    }

    /** @return array{0: User, 1: Conversation} */
    private function conversation(): array
    {
        $admin = User::factory()->create();
        $member = User::factory()->create();

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($member->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        return [$member, $conversation];
    }
}
