<?php

namespace Tests\Feature\WizardDraft;

use App\Models\User;
use App\Models\WizardDraft;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-250 — Generic resumable wizard draft CRUD, strictly user-scoped.
 */
class WizardDraftCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_endpoints_require_auth(): void
    {
        $this->getJson('/api/me/wizard-drafts')->assertUnauthorized();
        $this->getJson('/api/me/wizard-drafts/host-individual-wizard')->assertUnauthorized();
        $this->putJson('/api/me/wizard-drafts/host-individual-wizard', ['step' => 0])->assertUnauthorized();
        $this->deleteJson('/api/me/wizard-drafts/host-individual-wizard')->assertUnauthorized();
    }

    public function test_show_returns_404_when_no_draft_exists(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/me/wizard-drafts/host-individual-wizard')
            ->assertStatus(404);
    }

    public function test_upsert_creates_then_updates_draft(): void
    {
        $user = User::factory()->create();
        $key = 'host-individual-wizard';

        $create = $this->actingAs($user)
            ->putJson("/api/me/wizard-drafts/{$key}", [
                'step' => 1,
                'data' => ['title' => 'Studio Plateau', 'price' => 250000],
            ]);
        $create->assertStatus(201);

        $this->assertDatabaseCount('wizard_drafts', 1);
        $this->assertDatabaseHas('wizard_drafts', [
            'user_id' => $user->id,
            'key' => $key,
            'step' => 1,
        ]);

        $update = $this->actingAs($user)
            ->putJson("/api/me/wizard-drafts/{$key}", [
                'step' => 2,
                'data' => ['title' => 'Studio Plateau', 'price' => 275000, 'rooms' => 1],
            ]);
        $update->assertOk();

        // Still a single row (unique on user_id + key).
        $this->assertDatabaseCount('wizard_drafts', 1);
        $this->assertDatabaseHas('wizard_drafts', [
            'user_id' => $user->id,
            'key' => $key,
            'step' => 2,
        ]);
    }

    public function test_show_returns_persisted_step_and_data(): void
    {
        $user = User::factory()->create();
        $draft = WizardDraft::factory()->for($user)->create([
            'key' => 'owner-onboarding-12',
            'step' => 3,
            'data' => ['legal_form' => 'particulier', 'iban' => 'SN08SN0100152000048500003035'],
        ]);

        $this->actingAs($user)
            ->getJson('/api/me/wizard-drafts/owner-onboarding-12')
            ->assertOk()
            ->assertJsonPath('data.id', $draft->id)
            ->assertJsonPath('data.step', 3)
            ->assertJsonPath('data.data.legal_form', 'particulier');
    }

    public function test_index_lists_user_drafts_only(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        WizardDraft::factory()->for($user)->create(['key' => 'host-individual-wizard', 'step' => 1]);
        WizardDraft::factory()->for($user)->create(['key' => 'owner-onboarding-7', 'step' => 0]);
        WizardDraft::factory()->for($other)->create(['key' => 'host-individual-wizard', 'step' => 0]);

        $response = $this->actingAs($user)
            ->getJson('/api/me/wizard-drafts')
            ->assertOk();

        $keys = collect($response->json('data'))->pluck('key')->all();
        $this->assertCount(2, $keys);
        $this->assertContains('host-individual-wizard', $keys);
        $this->assertContains('owner-onboarding-7', $keys);
    }

    public function test_destroy_clears_draft_idempotently(): void
    {
        $user = User::factory()->create();
        WizardDraft::factory()->for($user)->create(['key' => 'host-individual-wizard']);

        $this->actingAs($user)
            ->deleteJson('/api/me/wizard-drafts/host-individual-wizard')
            ->assertNoContent();

        $this->assertDatabaseCount('wizard_drafts', 0);

        // Idempotent: a second DELETE on a missing draft still returns 204.
        $this->actingAs($user)
            ->deleteJson('/api/me/wizard-drafts/host-individual-wizard')
            ->assertNoContent();
    }

    public function test_step_must_be_non_negative_integer(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/host-individual-wizard', ['step' => -1])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['step']);

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/host-individual-wizard', ['step' => 'foo'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['step']);
    }

    public function test_data_must_be_an_object_when_provided(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/host-individual-wizard', [
                'step' => 1,
                'data' => 'not-an-object',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['data']);
    }

    public function test_data_can_be_omitted_or_null(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/host-individual-wizard', ['step' => 0])
            ->assertStatus(201);

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/host-individual-wizard', ['step' => 1, 'data' => null])
            ->assertOk();
    }

    /**
     * TCK-1809 (P181.02) — la colonne `wizard_drafts.key` est un varchar(255) :
     * une clé plus longue rendait 500 (`SQLSTATE[22001]`). La contrainte de
     * route la borne, et la refuse en 404 comme une clé hors de son alphabet.
     */
    public function test_key_longer_than_255_characters_is_not_found_on_every_route(): void
    {
        $user = User::factory()->create();
        $key = str_repeat('k', 256);

        $this->actingAs($user)
            ->putJson("/api/me/wizard-drafts/{$key}", ['step' => 1, 'data' => ['a' => 1]])
            ->assertNotFound();
        $this->actingAs($user)->getJson("/api/me/wizard-drafts/{$key}")->assertNotFound();
        $this->actingAs($user)->deleteJson("/api/me/wizard-drafts/{$key}")->assertNotFound();

        $this->assertDatabaseCount('wizard_drafts', 0);
    }

    public function test_key_of_exactly_255_characters_is_accepted(): void
    {
        $user = User::factory()->create();
        $key = str_repeat('k', 255);

        $this->actingAs($user)
            ->putJson("/api/me/wizard-drafts/{$key}", ['step' => 1, 'data' => ['a' => 1]])
            ->assertStatus(201);
        $this->actingAs($user)->getJson("/api/me/wizard-drafts/{$key}")->assertOk();
        $this->actingAs($user)->deleteJson("/api/me/wizard-drafts/{$key}")->assertSuccessful();

        $this->assertDatabaseCount('wizard_drafts', 0);
    }
}
