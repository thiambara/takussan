<?php

namespace Tests\Feature\Api;

use App\Models\Enums\LeaseStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GuarantorTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_guarantor(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/guarantors', [
            'first_name' => 'Jean',
            'last_name' => 'Dupont',
            'phone' => '+221770000001',
            'email' => 'jean@example.com',
            'occupation' => 'Engineer',
            'monthly_income' => 800000,
            'relationship_to_tenant' => 'Father',
        ])->assertStatus(201)
            ->assertJsonPath('data.first_name', 'Jean')
            ->assertJsonPath('data.last_name', 'Dupont');

        $this->assertDatabaseHas('guarantors', ['first_name' => 'Jean', 'added_by_id' => $user->id]);
    }

    public function test_user_can_list_own_guarantors(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        Guarantor::factory()->create(['added_by_id' => $user->id]);
        Guarantor::factory()->create(['added_by_id' => $other->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/guarantors')->assertOk();
        $this->assertEquals(1, $response->json('meta.total'));
    }

    public function test_user_can_show_own_guarantor(): void
    {
        $user = User::factory()->create();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->getJson("/api/guarantors/{$guarantor->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $guarantor->id);
    }

    public function test_unrelated_user_cannot_show_guarantor(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $owner->id]);

        Sanctum::actingAs($other);

        $this->getJson("/api/guarantors/{$guarantor->id}")->assertForbidden();
    }

    public function test_user_can_update_own_guarantor(): void
    {
        $user = User::factory()->create();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->putJson("/api/guarantors/{$guarantor->id}", [
            'occupation' => 'Doctor',
        ])->assertOk()
            ->assertJsonPath('data.occupation', 'Doctor');
    }

    public function test_user_can_delete_own_guarantor(): void
    {
        $user = User::factory()->create();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/guarantors/{$guarantor->id}")->assertNoContent();
        $this->assertSoftDeleted('guarantors', ['id' => $guarantor->id]);
    }

    /**
     * VERIF-596 passe 5 (m-g) — un garant rattaché à un bail en attente de signature ou en cours ne
     * se supprime pas : il disparaîtrait du contrat sans rien défiger. Rattaché par le pivot comme
     * par l'ancienne colonne ; un bail clos ou en brouillon ne retient rien.
     */
    public function test_a_guarantor_of_an_open_lease_cannot_be_deleted(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        foreach ([LeaseStatus::PendingSignature, LeaseStatus::Active] as $status) {
            foreach (['pivot', 'colonne'] as $link) {
                $guarantor = Guarantor::factory()->create(['added_by_id' => $user->id]);
                $lease = Lease::factory()->create(['status' => $status]);
                $link === 'pivot'
                    ? $lease->guarantors()->attach($guarantor->id)
                    : $lease->forceFill(['guarantor_id' => $guarantor->id])->saveQuietly();

                $this->deleteJson("/api/guarantors/{$guarantor->id}")
                    ->assertStatus(422)
                    ->assertJsonPath('code', 'guarantor.attached_to_open_lease');
                $this->assertNotSoftDeleted('guarantors', ['id' => $guarantor->id]);
            }
        }

        foreach ([LeaseStatus::Draft, LeaseStatus::Terminated] as $status) {
            $guarantor = Guarantor::factory()->create(['added_by_id' => $user->id]);
            Lease::factory()->create(['status' => $status])->guarantors()->attach($guarantor->id);

            $this->deleteJson("/api/guarantors/{$guarantor->id}")->assertNoContent();
        }
    }

    public function test_create_requires_first_and_last_name(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/guarantors', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name']);
    }

    public function test_endpoints_require_auth(): void
    {
        $this->getJson('/api/guarantors')->assertUnauthorized();
        $this->postJson('/api/guarantors', [])->assertUnauthorized();
    }
}
