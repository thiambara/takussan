<?php

namespace Tests\Feature\WizardDraft;

use App\Models\User;
use App\Models\WizardDraft;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-250 AC4 — A user MUST NOT be able to read or mutate another user's draft.
 *
 * The endpoints are scoped on `user_id` server-side, so cross-user reads
 * present as 404 (the row "doesn't exist" from the requester's point of
 * view) rather than 403. Mutations on someone else's `(user_id, key)`
 * silently insert a new row for the requester — the unique index on
 * `(user_id, key)` keeps the original draft intact.
 */
class WizardDraftCrossUserAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_cannot_read_another_users_draft(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        WizardDraft::factory()->for($owner)->create(['key' => 'owner-onboarding-1']);

        $this->actingAs($intruder)
            ->getJson('/api/me/wizard-drafts/owner-onboarding-1')
            ->assertStatus(404);
    }

    public function test_upsert_does_not_overwrite_another_users_draft(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $original = WizardDraft::factory()->for($owner)->create([
            'key' => 'owner-onboarding-1',
            'step' => 2,
            'data' => ['iban' => 'SN08SN0100152000048500003035'],
        ]);

        $this->actingAs($intruder)
            ->putJson('/api/me/wizard-drafts/owner-onboarding-1', [
                'step' => 9,
                'data' => ['iban' => 'INTRUDER-IBAN'],
            ])
            ->assertStatus(201);

        // Owner's draft is intact — the unique index forced a new row for the intruder.
        $original->refresh();
        $this->assertSame(2, $original->step);
        $this->assertSame(['iban' => 'SN08SN0100152000048500003035'], $original->data);
        $this->assertDatabaseCount('wizard_drafts', 2);
    }

    public function test_destroy_does_not_remove_another_users_draft(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        WizardDraft::factory()->for($owner)->create(['key' => 'owner-onboarding-1']);

        $this->actingAs($intruder)
            ->deleteJson('/api/me/wizard-drafts/owner-onboarding-1')
            ->assertNoContent();

        $this->assertDatabaseCount('wizard_drafts', 1);
    }
}
