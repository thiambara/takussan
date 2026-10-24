<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\LeaseRenewalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\TestCase;

/**
 * TCK-1804 (P162.07) — trois listes « en cours » écrites à la main, ramenées sur leur source :
 * un renouvellement en préavis est encore un bail en cours (il arrête un second renouvellement),
 * un locataire en préavis peut laisser un avis, et les reversements « à venir » du bailleur
 * comptent ceux qui attendent une approbation.
 */
class ListesEnCoursPreavisEtReversementsAVenirTest extends TestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    public function test_un_renouvellement_en_preavis_arrete_un_second_renouvellement_du_parent(): void
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();
        $parent = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'status' => LeaseStatus::Expired,
            'start_date' => now()->subYears(2),
            'end_date' => now()->subYear(),
        ]);
        Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'renewed_from_lease_id' => $parent->id,
            'status' => LeaseStatus::Terminating,
            'start_date' => now()->subYear()->addDay(),
            'end_date' => now()->addMonths(2),
        ]);

        try {
            app(LeaseRenewalService::class)->renew($parent->fresh(), [
                'start_date' => now()->addDay()->toDateString(),
            ]);
            $this->fail('Un second renouvellement est passé alors que le premier est en préavis.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('parent', $e->errors());
        }

        $this->assertSame(1, Lease::query()->where('renewed_from_lease_id', $parent->id)->count());
    }

    public function test_un_locataire_en_preavis_peut_noter_le_bien(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $property = Property::factory()->published()->create();
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $customer->id,
            'status' => LeaseStatus::Terminating,
        ]);
        Sanctum::actingAs($user);

        // Le dépôt de l'avis lit `ReviewEligibility` ; l'écran public d'éligibilité, lui, admet
        // déjà tout bail (`PublicPropertyController::reviewEligibility`) et ne garde rien ici.
        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 4])->assertCreated();
    }

    public function test_les_reversements_a_venir_du_bailleur_comptent_ceux_en_attente_d_approbation(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        foreach (PayoutStatus::cases() as $status) {
            Payout::factory()->create([
                'agency_id' => $agency->id,
                'landlord_id' => $landlord->id,
                'payee_role' => PayeeRole::Landlord,
                'status' => $status,
            ]);
        }
        Sanctum::actingAs($landlord);

        $statuts = collect(
            $this->getJson("/api/payouts?filter[landlord_id]={$landlord->id}&filter[upcoming]=1&per_page=50")
                ->assertOk()
                ->json('data'),
        )->pluck('status')->sort()->values()->all();

        $this->assertSame(['awaiting_approval', 'pending', 'processing', 'scheduled'], $statuts);
    }
}
