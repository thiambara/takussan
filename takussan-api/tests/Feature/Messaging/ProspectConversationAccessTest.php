<?php

namespace Tests\Feature\Messaging;

use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P38.05, TCK-886 (ADR-0068 § 2) — sur un fil de prospect (directe portant un `property_id`), un
 * participant autre que le prospect n'a accès que s'il est le contact principal ACTUEL du bien.
 *
 * Mesuré avant le correctif : l'agent dont la collaboration est retirée lisait encore le fil
 * (`GET …/messages` → 200, numéro du prospect compris) et y écrivait (`POST` → 201).
 */
class ProspectConversationAccessTest extends TestCase
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

    /** Le prospect écrit depuis la fiche : le fil s'ouvre chez l'agent, contact principal. */
    private function prospectContacts(string $text = 'Mon numero 77 000 00 00'): Conversation
    {
        Sanctum::actingAs($this->prospect);
        $id = $this->postJson("/api/public/properties/{$this->property->slug}/contact-message", [
            'message' => $text,
        ])->assertCreated()->json('data.conversation_id');

        return Conversation::findOrFail($id);
    }

    public function test_the_current_primary_contact_reads_and_writes_the_thread(): void
    {
        $conversation = $this->prospectContacts();

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/conversations/{$conversation->id}/messages")->assertOk();
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Bonjour'])->assertCreated();
        $this->assertContains($conversation->id, $this->listedIds());
    }

    public function test_a_removed_collaborator_loses_read_and_write_access(): void
    {
        $conversation = $this->prospectContacts();
        $this->collaboration->delete();

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/conversations/{$conversation->id}")->assertForbidden();
        $this->getJson("/api/conversations/{$conversation->id}/messages")->assertForbidden();
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Toujours là'])->assertForbidden();
    }

    public function test_a_removed_collaborator_no_longer_lists_or_finds_the_thread(): void
    {
        $conversation = $this->prospectContacts();
        $this->collaboration->delete();

        Sanctum::actingAs($this->agent);
        $this->assertNotContains($conversation->id, $this->listedIds());

        $ids = app(ConversationAccess::class)->participatingQuery($this->agent, activeOnly: false)->pluck('conversations.id')->all();
        $this->assertNotContains($conversation->id, $ids);
    }

    public function test_the_prospect_keeps_access_to_his_thread(): void
    {
        $conversation = $this->prospectContacts();
        $this->collaboration->delete();

        Sanctum::actingAs($this->prospect);
        $this->getJson("/api/conversations/{$conversation->id}/messages")->assertOk();
        $this->assertContains($conversation->id, $this->listedIds());
    }

    public function test_a_removed_collaborator_is_not_notified_of_the_prospect_s_next_message(): void
    {
        $conversation = $this->prospectContacts();
        $this->collaboration->delete();
        $before = AppNotification::query()->where('user_id', $this->agent->id)->count();

        Sanctum::actingAs($this->prospect);
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Vous êtes là ?'])->assertCreated();

        $this->assertSame($before, AppNotification::query()->where('user_id', $this->agent->id)->count());
    }

    public function test_access_follows_eligibility_without_any_write_on_the_property(): void
    {
        $conversation = $this->prospectContacts();
        $this->agent->forceFill(['status' => 'blocked'])->save();

        $this->assertFalse(app(ConversationAccess::class)->allows($this->agent->fresh(), $conversation));
        $this->assertTrue(app(ConversationAccess::class)->allows($this->prospect, $conversation));
    }

    public function test_a_thread_without_property_is_untouched(): void
    {
        $conversation = $this->prospectContacts();
        $conversation->forceFill(['property_id' => null])->save();
        $this->collaboration->delete();

        $this->assertTrue(app(ConversationAccess::class)->allows($this->agent, $conversation->fresh()));
    }

    /** @return list<int> */
    private function listedIds(): array
    {
        return collect($this->getJson('/api/conversations?per_page=100')->assertOk()->json('data'))
            ->pluck('id')->all();
    }
}
