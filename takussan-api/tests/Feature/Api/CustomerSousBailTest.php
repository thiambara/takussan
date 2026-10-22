<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P130.05 (TCK-1332) — une fiche client titulaire d'un bail en attente de signature ou en cours
 * ne se supprime plus : 422 `customer.attached_to_open_lease`, même forme que le garant.
 *
 * Avant, `destroy` rendait 204 : le bail restait `active` sans locataire, les relances partaient
 * vers personne et les pénalités de retard s'appliquaient encore (P130.05), et le locataire à
 * compte perdait l'accès à son bail, ses quittances et ses factures (P130.01).
 */
class CustomerSousBailTest extends TestCase
{
    use RefreshDatabase;

    private function ficheAvecBail(?LeaseStatus $status): array
    {
        $author = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $author->id]);

        if ($status !== null) {
            Lease::factory()->create(['tenant_id' => $customer->id, 'status' => $status]);
        }

        return [$author, $customer];
    }

    public function test_une_fiche_sous_bail_ouvert_ne_se_supprime_pas(): void
    {
        foreach ([LeaseStatus::Active, LeaseStatus::PendingSignature] as $status) {
            [$author, $customer] = $this->ficheAvecBail($status);
            Sanctum::actingAs($author);

            $this->deleteJson("/api/customers/{$customer->id}")
                ->assertStatus(422)
                ->assertJsonPath('code', 'customer.attached_to_open_lease');

            $this->assertNotSoftDeleted($customer);
        }
    }

    public function test_une_fiche_sans_bail_ouvert_se_supprime(): void
    {
        foreach ([null, LeaseStatus::Terminated, LeaseStatus::Draft] as $status) {
            [$author, $customer] = $this->ficheAvecBail($status);
            Sanctum::actingAs($author);

            $this->deleteJson("/api/customers/{$customer->id}")->assertNoContent();

            $this->assertSoftDeleted($customer);
        }
    }
}
