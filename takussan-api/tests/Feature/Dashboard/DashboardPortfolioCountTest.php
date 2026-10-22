<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P127.04 (TCK-1359) — le portefeuille du bailleur et les biens gérés de l'agent comptent les biens
 * hors `archived` et `sold` ; `draft`, `pending_review` et `rejected` restent au portefeuille
 * (décision du porteur, 2026-10-22). Les deux compteurs étaient un `COUNT(*)` sans statut.
 */
class DashboardPortfolioCountTest extends ApiTestCase
{
    use RefreshDatabase;

    private const STATUSES = [
        PropertyStatus::Archived,
        PropertyStatus::Sold,
        PropertyStatus::Draft,
        PropertyStatus::PendingReview,
        PropertyStatus::Rejected,
        PropertyStatus::Available,
    ];

    /** Six biens, un par statut : quatre restent au portefeuille. */
    private const IN_PORTFOLIO = 4;

    public function test_owner_portfolio_leaves_out_archived_and_sold_properties(): void
    {
        $agency = Agency::factory()->create();
        $owner = $this->apiActingAsRole('owner', ['agency' => $agency]);
        foreach (self::STATUSES as $status) {
            Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id, 'status' => $status]);
        }

        $portfolio = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.portfolio');
        $this->assertSame(self::IN_PORTFOLIO, $portfolio['total']);
        $this->assertSame(1, $portfolio['available']);

        $this->assertSame(self::IN_PORTFOLIO, $this->apiGet('/api/dashboard/me')->assertOk()->json('data.metrics.portfolio_total'));
    }

    public function test_agent_managed_properties_leave_out_archived_and_sold_in_both_scopes(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->apiActingAsRole('agent', ['agency' => $agency]);
        foreach (self::STATUSES as $status) {
            Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'status' => $status]);
        }

        $this->assertSame(self::IN_PORTFOLIO, $this->apiGet('/api/dashboard/agent')->assertOk()->json('data.properties_managed'));
        $this->assertSame(self::IN_PORTFOLIO, $this->apiGet('/api/dashboard/me')->assertOk()->json('data.metrics.properties_managed'));

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->assertSame(self::IN_PORTFOLIO, $this->apiGet('/api/dashboard/agent?scope=agency')->assertOk()->json('data.properties_managed'));
    }
}
