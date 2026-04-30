<?php

namespace Tests\Feature\Api;

use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-085 — Covers AC1, AC2 + scope/cap rules for `POST /conversations`
 * with `type = group`.
 */
class GroupConversationCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_ac1_creates_group_conversation_with_creator_as_admin(): void
    {
        $me = User::factory()->create();
        $b = User::factory()->create();
        $c = User::factory()->create();

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Travaux salle de bain',
            'participants' => [$b->id, $c->id],
        ])->assertCreated();

        $convId = $resp->json('data.id');
        $this->assertNotNull($convId);
        $this->assertSame('group', $resp->json('data.type'));

        // Creator is admin
        $creatorRole = DB::table('conversation_participants')
            ->where('conversation_id', $convId)
            ->where('user_id', $me->id)
            ->value('role');
        $this->assertSame(ParticipantRole::Admin->value, $creatorRole);

        // The other two are members
        foreach ([$b->id, $c->id] as $uid) {
            $r = DB::table('conversation_participants')
                ->where('conversation_id', $convId)
                ->where('user_id', $uid)
                ->value('role');
            $this->assertSame(ParticipantRole::Member->value, $r);
        }
    }

    public function test_ac2_rejects_group_with_only_one_other_participant(): void
    {
        $me = User::factory()->create();
        $b = User::factory()->create();

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Trop petit',
            'participants' => [$b->id],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['participants']);
    }

    public function test_rejects_group_without_subject(): void
    {
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'participants' => [$a->id, $b->id],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['subject']);
    }

    public function test_rejects_group_with_more_than_20_participants(): void
    {
        $me = User::factory()->create();
        $others = User::factory()->count(20)->create();

        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Trop nombreux',
            'participants' => $others->pluck('id')->all(), // 20 others + 1 creator = 21
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['participants']);
    }

    public function test_direct_conversation_path_still_works(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'subject' => 'Hello direct',
            'participants' => [$other->id],
        ])->assertCreated();

        $this->assertSame(ConversationType::Direct->value, $resp->json('data.type'));
    }

    public function test_creator_is_filtered_out_if_listed_in_participants(): void
    {
        // Even if the FE redundantly sends the creator id, we accept the
        // payload — the service de-duplicates and never double-attaches.
        $me = User::factory()->create();
        $a = User::factory()->create();
        $b = User::factory()->create();

        Sanctum::actingAs($me);

        $resp = $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Dedup test',
            'participants' => [$a->id, $b->id, $me->id],
        ])->assertCreated();

        $convId = $resp->json('data.id');
        $count = DB::table('conversation_participants')->where('conversation_id', $convId)->count();
        $this->assertSame(3, $count);
    }
}
