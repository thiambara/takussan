<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerTagsTest extends TestCase
{
    use RefreshDatabase;

    // ───────────────────��──────────────────────────────���───────────────────────
    // Attach (POST /customers/{id}/tags)
    // ───────────────────────────────��──────────────────────────���───────────────

    public function test_agent_can_attach_new_tags_to_own_customer(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/tags", [
            'tags' => ['vip', 'prospect chaud'],
        ])->assertOk()
            ->assertJsonCount(2, 'data');

        $this->assertCount(2, $customer->refresh()->tags);
        $this->assertTrue(Tag::where('name', 'vip')->where('type', TagType::Crm->value)->exists());
    }

    public function test_attach_normalizes_name_lowercase_trim(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/tags", [
            'tags' => ['  VIP  '],
        ])->assertOk();

        $this->assertTrue(Tag::where('name', 'vip')->exists());
        $this->assertFalse(Tag::where('name', 'VIP')->exists());
    }

    public function test_attach_is_idempotent_on_existing_tag(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $tag = Tag::factory()->create(['name' => 'vip', 'type' => TagType::Crm]);
        $customer->tags()->attach($tag);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/tags", [
            'tags' => ['vip'],
        ])->assertOk()
            ->assertJsonCount(1, 'data');

        $this->assertCount(1, $customer->refresh()->tags);
    }

    public function test_attach_creates_tag_if_absent(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->assertFalse(Tag::where('name', 'bailleur stratégique')->exists());

        $this->postJson("/api/customers/{$customer->id}/tags", [
            'tags' => ['bailleur stratégique'],
        ])->assertOk();

        $this->assertTrue(Tag::where('name', 'bailleur stratégique')->where('type', TagType::Crm->value)->exists());
    }

    public function test_attach_reuses_existing_tag_with_different_case(): void
    {
        // Seeder-style: pre-existing tag stored capitalised. Attaching the
        // normalised lowercase name must reuse that row, not create a duplicate
        // or fail on the `tags.name` unique constraint.
        $existing = Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/tags", [
            'tags' => ['vip'],
        ])->assertOk();

        $this->assertSame(1, Tag::where('type', TagType::Crm->value)->count());
        $this->assertSame([$existing->id], $customer->refresh()->tags->pluck('id')->all());
    }

    public function test_attach_rejects_11th_tag(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        // Attach 10 tags
        $tags = Tag::factory()->count(10)->create(['type' => TagType::Crm]);
        $customer->tags()->attach($tags->pluck('id'));
        $this->assertCount(10, $customer->refresh()->tags);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/tags", [
            'tags' => ['eleventh'],
        ])->assertStatus(422);

        $this->assertCount(10, $customer->refresh()->tags);
    }

    public function test_attach_rejected_for_other_agency_customer(): void
    {
        [$agencyA, $agencyB] = Agency::factory()->count(2)->create();

        $user = User::factory()->create(['agency_id' => $agencyA->id]);
        $otherUser = User::factory()->create(['agency_id' => $agencyB->id]);
        $other = Customer::factory()->create(['added_by_id' => $otherUser->id, 'agency_id' => $agencyB->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$other->id}/tags", [
            'tags' => ['vip'],
        ])->assertForbidden();
    }

    public function test_attach_requires_tags_array(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/tags", [
            'tags' => 'not-an-array',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['tags']);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Detach (DELETE /customers/{id}/tags/{tag})
    // ──────────────────────────────────────────────────────────────────────────

    public function test_agent_can_detach_tag(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $tagA = Tag::factory()->create(['type' => TagType::Crm]);
        $tagB = Tag::factory()->create(['type' => TagType::Crm]);
        $customer->tags()->attach([$tagA->id, $tagB->id]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/customers/{$customer->id}/tags/{$tagA->id}")
            ->assertNoContent();

        $ids = $customer->refresh()->tags->pluck('id')->all();
        $this->assertSame([$tagB->id], $ids);
    }

    public function test_detach_rejected_for_other_agency_customer(): void
    {
        [$agencyA, $agencyB] = Agency::factory()->count(2)->create();

        $user = User::factory()->create(['agency_id' => $agencyA->id]);
        $otherUser = User::factory()->create(['agency_id' => $agencyB->id]);
        $other = Customer::factory()->create(['added_by_id' => $otherUser->id, 'agency_id' => $agencyB->id]);
        $tag = Tag::factory()->create(['type' => TagType::Crm]);
        $other->tags()->attach($tag);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/customers/{$other->id}/tags/{$tag->id}")
            ->assertForbidden();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Filter OR (GET /customers?filter[tags]=...)
    // ──────────────────────────────────────────���─────────────────────────────��─

    public function test_filter_tags_or_returns_customers_with_any_tag(): void
    {
        $user = User::factory()->create();
        $vip = Tag::factory()->create(['name' => 'vip', 'type' => TagType::Crm]);
        $prospect = Tag::factory()->create(['name' => 'prospect', 'type' => TagType::Crm]);

        $c1 = Customer::factory()->create(['added_by_id' => $user->id]);
        $c1->tags()->attach($vip);

        $c2 = Customer::factory()->create(['added_by_id' => $user->id]);
        $c2->tags()->attach($prospect);

        $c3 = Customer::factory()->create(['added_by_id' => $user->id]); // no tags

        Sanctum::actingAs($user);

        $res = $this->getJson('/api/customers?filter[tags]=vip,prospect')
            ->assertOk();

        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertContains($c1->id, $ids);
        $this->assertContains($c2->id, $ids);
        $this->assertNotContains($c3->id, $ids);
    }

    // ──────────────────────��───────────────────────────────────────────────────
    // Filter AND (GET /customers?filter[tags_all]=...)
    // ───────────────────────────────��──────────────────────────────���───────────

    public function test_filter_tags_all_returns_only_customers_with_all_tags(): void
    {
        $user = User::factory()->create();
        $vip = Tag::factory()->create(['name' => 'vip', 'type' => TagType::Crm]);
        $prospect = Tag::factory()->create(['name' => 'prospect', 'type' => TagType::Crm]);

        $c1 = Customer::factory()->create(['added_by_id' => $user->id]);
        $c1->tags()->attach([$vip->id, $prospect->id]);

        $c2 = Customer::factory()->create(['added_by_id' => $user->id]);
        $c2->tags()->attach($vip); // only vip

        Sanctum::actingAs($user);

        $res = $this->getJson('/api/customers?filter[tags_all]=vip,prospect')
            ->assertOk();

        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertContains($c1->id, $ids);
        $this->assertNotContains($c2->id, $ids);
    }

    // ─────────────────────��───────────────────────────��────────────────────────
    // Include tags
    // ────────────────────────────────────────────��─────────────────────────────

    public function test_customer_list_includes_tags_when_requested(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $tag = Tag::factory()->create(['name' => 'vip', 'type' => TagType::Crm]);
        $customer->tags()->attach($tag);

        Sanctum::actingAs($user);

        $res = $this->getJson("/api/customers/{$customer->id}?include=tags")
            ->assertOk();

        $tags = $res->json('data.tags');
        $this->assertCount(1, $tags);
        $this->assertSame('vip', $tags[0]['name']);
    }

    // ───────────────────────────────────────────────────���──────────────────────
    // Activity log
    // ──────────────────────────────────────────��───────────────────────────────

    public function test_attach_logs_activity(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/tags", ['tags' => ['vip']]);

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => Customer::class,
            'subject_id' => $customer->id,
            'event' => 'tag.attached',
        ]);
    }

    public function test_detach_logs_activity(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $tag = Tag::factory()->create(['name' => 'vip', 'type' => TagType::Crm]);
        $customer->tags()->attach($tag);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/customers/{$customer->id}/tags/{$tag->id}");

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => Customer::class,
            'subject_id' => $customer->id,
            'event' => 'tag.detached',
        ]);
    }
}
