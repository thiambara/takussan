<?php

namespace Tests\Feature\Api;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use App\Services\Messaging\GroupConversationService;
use App\Services\Messaging\SystemMessageFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TCK-085 — Covers AC8: system messages are emitted for the four
 * lifecycle events and remain immutable (PATCH/DELETE → 403).
 */
class SystemMessagesTest extends TestCase
{
    use RefreshDatabase;

    private function makeGroup(): array
    {
        $admin = User::factory()->create();
        $b = User::factory()->create();
        $c = User::factory()->create();

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Test',
            'created_by' => $admin->id,
        ]);

        $conversation->participants()->attach($admin->id, [
            'role' => ParticipantRole::Admin->value, 'joined_at' => now(),
        ]);
        $conversation->participants()->attach($b->id, [
            'role' => ParticipantRole::Member->value, 'joined_at' => now(),
        ]);
        $conversation->participants()->attach($c->id, [
            'role' => ParticipantRole::Member->value, 'joined_at' => now(),
        ]);

        return [$admin, $b, $c, $conversation];
    }

    public function test_factory_emits_participant_added_event(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $newcomer = User::factory()->create();

        /** @var SystemMessageFactory $factory */
        $factory = app(SystemMessageFactory::class);
        $msg = $factory->participantAdded($conversation, $admin, $newcomer);

        $this->assertSame(MessageType::System->value, $msg->type->value);
        $this->assertNull($msg->sender_id);
        $this->assertSame('participant_added', $msg->metadata['event']);
        $this->assertSame($newcomer->id, $msg->metadata['target_id']);
    }

    public function test_factory_emits_participant_removed_event(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        $factory = app(SystemMessageFactory::class);
        $msg = $factory->participantRemoved($conversation, $admin, $b);

        $this->assertSame('participant_removed', $msg->metadata['event']);
        $this->assertSame($b->id, $msg->metadata['target_id']);
        $this->assertFalse($msg->metadata['self_leave']);

        // Self-leave variant
        $self = $factory->participantRemoved($conversation, $b, $b);
        $this->assertTrue($self->metadata['self_leave']);
    }

    public function test_factory_emits_role_changed_event(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        $factory = app(SystemMessageFactory::class);
        $msg = $factory->roleChanged($conversation, $admin, $b, ParticipantRole::Admin->value);

        $this->assertSame('role_changed', $msg->metadata['event']);
        $this->assertSame('admin', $msg->metadata['role']);
    }

    public function test_factory_emits_renamed_event(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        $factory = app(SystemMessageFactory::class);
        $msg = $factory->renamed($conversation, $admin, 'Old', 'New');

        $this->assertSame('renamed', $msg->metadata['event']);
        $this->assertSame('Old', $msg->metadata['old_subject']);
        $this->assertSame('New', $msg->metadata['new_subject']);
    }

    public function test_ac8_system_message_cannot_be_updated(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $factory = app(SystemMessageFactory::class);
        $msg = $factory->renamed($conversation, $admin, 'Old', 'New');

        $this->expectException(HttpException::class);
        $msg->update(['content' => 'tampered']);
    }

    public function test_ac8_system_message_cannot_be_deleted(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $factory = app(SystemMessageFactory::class);
        $msg = $factory->renamed($conversation, $admin, 'Old', 'New');

        $this->expectException(HttpException::class);
        $msg->delete();
    }

    public function test_observer_updates_last_message_caches_after_system_message(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $factory = app(SystemMessageFactory::class);
        $factory->renamed($conversation, $admin, 'Old', 'New name applied');

        $conversation->refresh();
        $this->assertNotNull($conversation->last_message_id);
        $this->assertNotNull($conversation->last_message_at);
        $this->assertNotNull($conversation->last_message_preview);
    }

    public function test_full_flow_via_service_emits_all_four_events(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $newcomer = User::factory()->create();
        // Make a previous shared conv so scope passes if used through HTTP later.

        /** @var GroupConversationService $svc */
        $svc = app(GroupConversationService::class);

        $svc->addParticipants($conversation, $admin, [$newcomer->id]);
        $svc->setRole($conversation, $admin, $newcomer, ParticipantRole::Admin);
        $svc->rename($conversation, $admin, 'Renamed group');
        $svc->removeParticipant($conversation, $admin, $b);

        $events = DB::table('messages')
            ->where('conversation_id', $conversation->id)
            ->where('type', 'system')
            ->get()
            ->map(fn ($row) => json_decode($row->metadata, true)['event'])
            ->all();

        $this->assertSame([
            'participant_added',
            'role_changed',
            'renamed',
            'participant_removed',
        ], $events);
    }
}
