<?php

namespace Tests\Feature\Messaging;

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
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-592 — AC22, moitié note vocale (ADR-0038) : ≤ 60 s déclarées, ≤ 2 Mo appliqués, fichier
 * privé servi par URL signée. Le refus d'un `audio` sans fichier ou d'un fichier texte est la garde ;
 * la note acceptée en est le témoin.
 */
class AudioMessageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
    }

    public function test_voice_note_is_accepted_and_served_by_signed_url(): void
    {
        [$member, $conversation] = $this->conversation();

        Sanctum::actingAs($member);
        $response = $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'audio',
            'duration' => 42,
            'audio' => $this->voiceNote(),
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('data.type', 'audio')
            ->assertJsonPath('data.metadata.duration', 42);

        $message = Message::query()->sole();
        $media = $message->getFirstMedia('attachments');
        $this->assertNotNull($media);
        $this->assertSame(config('media-library.disk_name'), $media->disk);
        $this->assertSame(__('messaging.audio_preview'), $message->content);

        $url = $response->json('data.attachments.0.url');
        $this->assertStringContainsString('signature=', $url);
        $this->assertContains($this->get($url)->status(), [200, 302]);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function refused(): array
    {
        return [
            'audio sans fichier' => [['type' => 'audio', 'duration' => 10], 'audio'],
            'fichier texte' => [['type' => 'audio', 'duration' => 10, 'audio' => 'text'], 'audio'],
            'plus de 60 s' => [['type' => 'audio', 'duration' => 61, 'audio' => 'voice'], 'duration'],
            'sans durée' => [['type' => 'audio', 'audio' => 'voice'], 'duration'],
            'plus de 2 Mo' => [['type' => 'audio', 'duration' => 30, 'audio' => 'big'], 'audio'],
            'fichier joint à un texte' => [['content' => 'Bonjour', 'audio' => 'voice'], 'audio'],
        ];
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('refused')]
    public function test_invalid_voice_notes_are_refused(array $body, string $field): void
    {
        [$member, $conversation] = $this->conversation();

        if (isset($body['audio'])) {
            $body['audio'] = match ($body['audio']) {
                'text' => UploadedFile::fake()->createWithContent('note.txt', 'pas un son'),
                'big' => $this->voiceNote(2049 * 1024),
                default => $this->voiceNote(),
            };
        }

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", $body, ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertSame(0, Message::query()->count());
    }

    /** Un vrai en-tête Ogg : `finfo` y lit `audio/ogg`, comme sur un enregistrement réel. */
    private function voiceNote(int $padding = 64): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('note.ogg', "OggS\x00\x02".str_repeat("\x00", 20).'OpusHead'.str_repeat("\x00", $padding));
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
