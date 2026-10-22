<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Plan;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P147.04 (TCK-1433) — le quota d'annonces se juge au seul point commun des écritures de statut,
 * l'observateur `updating` : un bien qui entre dans `QuotaResolver::ACTIVE_LISTING_STATUSES` est
 * refusé au-delà de la limite, quel que soit le chemin. Avant, seuls `store` et `publish` le
 * jugeaient (TCK-627) : `PATCH {status: available}` et `PUT …/status` `pending` passaient outre.
 */
class QuotaDAnnoncesAuChangementDeStatutTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        AgencySubscription::query()->create([
            'agency_id' => $this->agency->id,
            'plan_id' => Plan::query()->create([
                'code' => 'free',
                'label' => 'Free',
                'monthly_price_xof' => 0,
                'platform_fee_pct' => 0,
                'trial_days' => 0,
                'limits' => ['max_active_listings' => 1],
                'is_active' => true,
                'sort_order' => 10,
            ])->id,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);
    }

    private function bien(PropertyStatus $status): Property
    {
        return Property::factory()->create([
            'agency_id' => $this->agency->id,
            'status' => $status,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
        ]);
    }

    public function test_le_patch_vers_un_statut_actif_au_dela_du_quota_est_refuse(): void
    {
        $this->bien(PropertyStatus::Available);
        $brouillon = $this->bien(PropertyStatus::Draft);

        $this->patchJson("/api/properties/{$brouillon->id}", ['status' => 'available'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'quota.listings_exceeded');
        $this->assertSame(PropertyStatus::Draft, $brouillon->fresh()->status);
    }

    public function test_put_status_vers_un_statut_actif_au_dela_du_quota_est_refuse(): void
    {
        $this->bien(PropertyStatus::Available);
        $brouillon = $this->bien(PropertyStatus::Draft);

        $this->putJson("/api/properties/{$brouillon->id}/status", ['status' => 'pending'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'quota.listings_exceeded');
        $this->assertSame(PropertyStatus::Draft, $brouillon->fresh()->status);
    }

    public function test_changer_de_statut_actif_ne_compte_pas_l_annonce_deux_fois(): void
    {
        $enLigne = $this->bien(PropertyStatus::Available);

        $this->putJson("/api/properties/{$enLigne->id}/status", ['status' => 'pending'])->assertOk();
        $this->assertSame(PropertyStatus::Pending, $enLigne->fresh()->status);
    }

    public function test_sous_la_limite_le_patch_passe(): void
    {
        $brouillon = $this->bien(PropertyStatus::Draft);

        $this->patchJson("/api/properties/{$brouillon->id}", ['status' => 'available'])->assertOk();
        $this->assertSame(PropertyStatus::Available, $brouillon->fresh()->status);
    }
}
