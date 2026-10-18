<?php

namespace Tests\Feature\Messaging;

use App\Models\Conversation;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Messaging\PropertyConversationResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P38.05, TCK-887 (ADR-0068 § 3) — le fil d'un prospect suit le contact principal du bien : quand
 * celui-ci change, la relance du prospect retrouve LE MÊME fil, transmis au nouveau répondant,
 * au lieu d'en ouvrir un second.
 *
 * Mesuré avant le correctif : la relance du visiteur ouvrait un fil neuf chez le nouveau contact
 * principal, et l'historique restait chez l'ancien agent.
 */
class ProspectConversationTransferTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $agent;

    private User $prospect;

    private Property $property;

    private PropertyCollaborator $collaboration;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->agent = User::factory()->create();
        $this->prospect = User::factory()->create();
        $this->property = Property::factory()->published()->create(['user_id' => $this->owner->id]);
        $this->collaboration = PropertyCollaborator::create([
            'property_id' => $this->property->id,
            'user_id' => $this->agent->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);
    }

    private function contact(string $text): int
    {
        Sanctum::actingAs($this->prospect);

        return $this->postJson("/api/public/properties/{$this->property->slug}/contact-message", [
            'message' => $text,
        ])->assertCreated()->json('data.conversation_id');
    }

    /** @return array<int, ?string> user_id => left_at */
    private function participations(int $conversationId): array
    {
        return DB::table('conversation_participants')
            ->where('conversation_id', $conversationId)
            ->pluck('left_at', 'user_id')
            ->all();
    }

    public function test_the_prospect_s_follow_up_lands_in_the_same_thread_handed_to_the_new_contact(): void
    {
        $first = $this->contact('Mon numero 77 000 00 00');
        $this->collaboration->delete();

        $second = $this->contact('Toujours intéressé');

        $this->assertSame($first, $second);
        $this->assertSame(1, Conversation::query()->where('property_id', $this->property->id)->count());

        $participations = $this->participations($first);
        $this->assertNull($participations[$this->prospect->id]);
        $this->assertNull($participations[$this->owner->id], 'le nouveau contact principal est participant actif');
        $this->assertNotNull($participations[$this->agent->id], "l'ancien répondant est parti");

        // Le nouveau répondant lit tout l'historique.
        Sanctum::actingAs($this->owner);
        $this->assertCount(2, $this->getJson("/api/conversations/{$first}/messages")->assertOk()->json('data'));
    }

    public function test_opening_the_chat_finds_the_prospect_s_thread_whoever_answers_and_writes_nothing(): void
    {
        $first = $this->contact('Bonjour');
        $this->collaboration->delete();
        $before = DB::table('conversation_participants')->get()->toArray();

        Sanctum::actingAs($this->prospect);
        $this->getJson("/api/public/properties/{$this->property->slug}/conversation")
            ->assertOk()
            ->assertJsonPath('data.conversation_id', $first)
            ->assertJsonPath('data.recipient.id', $this->owner->id);

        $this->assertEquals($before, DB::table('conversation_participants')->get()->toArray());
    }

    public function test_the_transfer_is_idempotent(): void
    {
        $first = $this->contact('Bonjour');
        $this->collaboration->delete();
        $conversation = Conversation::findOrFail($first);

        $resolver = app(PropertyConversationResolver::class);
        $resolver->transmit($conversation, $this->owner);
        $leftAt = $this->participations($first)[$this->agent->id];
        $resolver->transmit($conversation, $this->owner);

        $this->assertSame(3, DB::table('conversation_participants')->where('conversation_id', $first)->count());
        $this->assertSame($leftAt, $this->participations($first)[$this->agent->id]);
        $this->assertNull($this->participations($first)[$this->owner->id]);
    }

    public function test_a_returning_responder_gets_a_fresh_participation(): void
    {
        $first = $this->contact('Bonjour');
        DB::table('conversation_participants')
            ->where('conversation_id', $first)->where('user_id', $this->agent->id)
            ->update(['is_muted' => true, 'archived_at' => now()]);
        $this->collaboration->delete();
        $this->contact('Relance');

        // L'agent est remis principal : le fil lui revient, sans sa sourdine ni son archivage.
        PropertyCollaborator::create([
            'property_id' => $this->property->id,
            'user_id' => $this->agent->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);
        $this->assertSame($first, $this->contact('Encore moi'));

        $row = DB::table('conversation_participants')->where('conversation_id', $first)->where('user_id', $this->agent->id)->first();
        $this->assertNull($row->left_at);
        $this->assertFalse((bool) $row->is_muted);
        $this->assertNull($row->archived_at);
        $this->assertNotNull($this->participations($first)[$this->owner->id]);
    }
}
