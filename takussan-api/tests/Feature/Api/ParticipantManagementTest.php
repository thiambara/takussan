<?php

namespace Tests\Feature\Api;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-085 — Covers AC3 (admin add → 201 + system msg + notif),
 * AC4 (member add → 403), AC5 (last admin guard) and the leave/promote
 * flows.
 */
class ParticipantManagementTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Build a 3-person group: $admin (admin), $b, $c (members).
     * Returns [$admin, $b, $c, $conversation].
     */
    private function makeGroup(): array
    {
        $admin = User::factory()->create();
        $b = User::factory()->create();
        $c = User::factory()->create();

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Test group',
            'created_by' => $admin->id,
        ]);

        $conversation->participants()->attach($admin->id, [
            'role' => ParticipantRole::Admin->value,
            'joined_at' => now(),
        ]);
        $conversation->participants()->attach($b->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now(),
        ]);
        $conversation->participants()->attach($c->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now(),
        ]);

        return [$admin, $b, $c, $conversation];
    }

    /**
     * Add a "shared past conversation" between $actor and $candidate so
     * the AddParticipantsRequest scope check passes (relation already
     * exists).
     */
    private function relate(User $actor, User $candidate): void
    {
        $past = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'past',
            'created_by' => $actor->id,
        ]);
        $past->participants()->attach($actor->id, ['joined_at' => now()]);
        $past->participants()->attach($candidate->id, ['joined_at' => now()]);
    }

    public function test_ac3_admin_can_add_participants_emits_system_message(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $newcomer = User::factory()->create();
        $this->relate($admin, $newcomer);

        Sanctum::actingAs($admin);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$newcomer->id],
        ])->assertCreated();

        // Newcomer is now a member with no left_at.
        $row = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $newcomer->id)
            ->first();
        $this->assertNotNull($row);
        $this->assertSame(ParticipantRole::Member->value, $row->role);
        $this->assertNull($row->left_at);

        // A system message was emitted with `metadata.event = participant_added`.
        $systemMsg = DB::table('messages')
            ->where('conversation_id', $conversation->id)
            ->where('type', 'system')
            ->first();
        $this->assertNotNull($systemMsg);
        $this->assertNull($systemMsg->sender_id);
        $meta = json_decode($systemMsg->metadata, true);
        $this->assertSame('participant_added', $meta['event']);
        $this->assertSame($newcomer->id, $meta['target_id']);
    }

    public function test_ac4_member_cannot_add_participants(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        $newcomer = User::factory()->create();
        $this->relate($b, $newcomer);

        Sanctum::actingAs($b);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$newcomer->id],
        ])->assertForbidden();

        $this->assertDatabaseMissing('conversation_participants', [
            'conversation_id' => $conversation->id,
            'user_id' => $newcomer->id,
        ]);
    }

    public function test_admin_can_remove_participant_with_system_message(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$b->id}")
            ->assertOk();

        $row = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->first();
        $this->assertNotNull($row->left_at);

        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversation->id,
            'type' => 'system',
        ]);
    }

    public function test_member_cannot_remove_other_participant(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$c->id}")
            ->assertForbidden();
    }

    public function test_member_can_leave_themselves(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$b->id}")
            ->assertOk();

        $row = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->first();
        $this->assertNotNull($row->left_at);
    }

    public function test_ac5_last_admin_cannot_leave(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$admin->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['role']);

        // Admin is still active.
        $row = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $admin->id)
            ->first();
        $this->assertNull($row->left_at);
    }

    public function test_admin_can_promote_member_then_leave(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);
        // Promote $b to admin
        $this->patchJson("/api/conversations/{$conversation->id}/participants/{$b->id}", [
            'role' => 'admin',
        ])->assertOk();

        $bRole = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->value('role');
        $this->assertSame('admin', $bRole);

        // Now the original admin can leave.
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$admin->id}")
            ->assertOk();
    }

    public function test_member_cannot_promote(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->patchJson("/api/conversations/{$conversation->id}/participants/{$c->id}", [
            'role' => 'admin',
        ])->assertForbidden();
    }

    public function test_admin_can_rename_group(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/conversations/{$conversation->id}", [
            'subject' => 'Nouveau nom',
        ])->assertOk();

        $this->assertDatabaseHas('conversations', [
            'id' => $conversation->id,
            'subject' => 'Nouveau nom',
        ]);

        // System message emitted
        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversation->id,
            'type' => 'system',
        ]);
    }

    public function test_member_cannot_rename(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->patchJson("/api/conversations/{$conversation->id}", [
            'subject' => 'Hack',
        ])->assertForbidden();
    }

    public function test_ac7_left_participant_no_longer_appears_in_their_list(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$b->id}")
            ->assertOk();

        // $b's conversations index should be empty (the only group they
        // were in is now left).
        $resp = $this->getJson('/api/conversations')->assertOk();
        $this->assertSame(0, $resp->json('meta.total'));
    }

    public function test_scope_check_blocks_unrelated_user(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();
        // Stranger has no relationship with admin and no shared agency.
        $stranger = User::factory()->create(['agency_id' => null]);

        Sanctum::actingAs($admin);
        // Admin themselves has no agency either.
        $admin->update(['agency_id' => null]);

        $this->postJson("/api/conversations/{$conversation->id}/participants", [
            'user_ids' => [$stranger->id],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids']);
    }
}
