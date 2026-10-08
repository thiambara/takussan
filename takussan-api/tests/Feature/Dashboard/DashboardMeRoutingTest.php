<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-595 — AC7 (versant API) et AC16 : `GET /api/dashboard/me` aiguille chaque compte vers SA vue.
 *
 * L'hôte créé par « Publier » est admin d'une agence `individual` (et bailleur) : il atterrissait sur
 * le tableau de bord d'agence, cross-équipe, que `docs/features.md` §2.5 réserve aux agences
 * `standard`. Un compte sans fiche `Customer` recevait 404.
 */
class DashboardMeRoutingTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_the_admin_of_an_individual_agency_lands_on_the_owner_view(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->individual()->create()]);

        $this->apiGet('/api/dashboard/me')->assertOk()->assertJsonPath('data.role', 'owner');
    }

    public function test_the_admin_of_a_standard_agency_keeps_the_agency_view(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);

        $this->apiGet('/api/dashboard/me')->assertOk()->assertJsonPath('data.role', 'agency_admin');
    }

    public function test_an_account_without_any_customer_record_is_a_client_not_a_404(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet('/api/dashboard/me')
            ->assertOk()
            ->assertJsonPath('data.role', 'tenant')
            ->assertJsonPath('data.metrics.has_customer_profile', false)
            ->assertJsonPath('data.metrics.visits_upcoming', []);
    }
}
