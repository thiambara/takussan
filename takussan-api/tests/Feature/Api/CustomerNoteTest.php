<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerNoteTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_note_on_own_customer(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/notes", [
            'body' => 'Interested in a 3-bedroom apartment.',
        ])->assertStatus(201)
            ->assertJsonPath('data.body', 'Interested in a 3-bedroom apartment.');

        $this->assertDatabaseHas('customer_notes', [
            'customer_id' => $customer->id,
            'author_id' => $user->id,
        ]);
    }

    public function test_unrelated_user_cannot_create_note(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $owner->id]);

        Sanctum::actingAs($other);

        $this->postJson("/api/customers/{$customer->id}/notes", ['body' => 'Test'])
            ->assertForbidden();
    }

    public function test_user_can_list_notes_for_own_customer(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        CustomerNote::factory()->count(3)->create(['customer_id' => $customer->id, 'author_id' => $user->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson("/api/customers/{$customer->id}/notes")->assertOk();
        $this->assertEquals(3, $response->json('meta.total'));
    }

    public function test_author_can_delete_own_note(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $note = CustomerNote::factory()->create([
            'customer_id' => $customer->id,
            'author_id' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/customers/{$customer->id}/notes/{$note->id}")
            ->assertNoContent();

        $this->assertSoftDeleted('customer_notes', ['id' => $note->id]);
    }

    public function test_non_author_cannot_delete_note(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create(['agency_id' => null]);
        $customer = Customer::factory()->create(['added_by_id' => $owner->id]);
        $note = CustomerNote::factory()->create(['customer_id' => $customer->id, 'author_id' => $owner->id]);

        // other needs access to customer to even reach delete — simulate via agency
        // Since other has no relation to this customer, they get 403 on the customer level
        Sanctum::actingAs($other);
        $this->deleteJson("/api/customers/{$customer->id}/notes/{$note->id}")
            ->assertForbidden();
    }

    public function test_note_body_is_required(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/notes", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['body']);
    }

    /**
     * TCK-978 (P54.03) — `customer_notes.pinned` est `NOT NULL DEFAULT false` : un `null` explicite
     * rend 422 (il rendait 500, `SQLSTATE[23502]`) ; la clé omise prend toujours le défaut.
     */
    public function test_une_note_epinglee_a_null_rend_422(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/notes", ['body' => 'Rappeler lundi.', 'pinned' => null])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['pinned']);

        $this->assertSame(0, CustomerNote::query()->count());
    }

    public function test_une_note_sans_pinned_n_est_pas_epinglee(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/notes", ['body' => 'Rappeler lundi.'])->assertStatus(201);

        $this->assertFalse((bool) CustomerNote::query()->sole()->pinned);
    }
}
